import { Contract, Interface, JsonRpcProvider, isAddress } from "ethers";

import type { ContractConfig, EventDeployment } from "../types/chainticket";
import { CHAIN_TICKET_FACTORY_ABI } from "./abi";

export function getFallbackEventDeployment(config: ContractConfig): EventDeployment {
  return {
    ticketEventId: config.eventId ?? "main-event",
    name: config.eventName ?? "Main Event",
    symbol: "CTK",
    primaryPriceWei: "0",
    maxSupply: "0",
    treasury: "",
    admin: "",
    ticketNftAddress: config.ticketNftAddress,
    marketplaceAddress: config.marketplaceAddress,
    checkInRegistryAddress: config.checkInRegistryAddress,
    deploymentBlock: config.deploymentBlock,
    registeredAt: 0,
  };
}

const FACTORY_V1_INTERFACE = new Interface([
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,uint256 primaryPrice,uint256 maxSupply,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,uint256 deploymentBlock,uint256 registeredAt))",
]);

const FACTORY_V2_INTERFACE = new Interface([
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
]);

function toSafeNumber(value: unknown, field: string): number {
  const normalized =
    typeof value === "bigint" ? value : BigInt(String(value ?? "0"));
  if (normalized < 0n) {
    throw new Error(`Factory ${field} cannot be negative: ${normalized.toString()}`);
  }
  if (normalized > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `Factory ${field} exceeds Number.MAX_SAFE_INTEGER: ${normalized.toString()}`,
    );
  }
  return Number(normalized);
}

function assertAddress(value: string, field: string): void {
  if (!isAddress(value)) {
    throw new Error(`Factory ${field} is not a valid address: ${value}`);
  }
}

function parseFactoryDeployment(raw: unknown): EventDeployment {
  const value = raw as {
    eventId?: unknown;
    name?: unknown;
    symbol?: unknown;
    primaryPrice?: unknown;
    maxSupply?: unknown;
    treasury?: unknown;
    admin?: unknown;
    ticketNFT?: unknown;
    marketplace?: unknown;
    checkInRegistry?: unknown;
    deploymentBlock?: unknown;
    registeredAt?: unknown;
  } & unknown[];

  return {
    ticketEventId: String(value.eventId ?? ""),
    name: String(value.name ?? ""),
    symbol: String(value.symbol ?? ""),
    primaryPriceWei: String(value.primaryPrice ?? "0"),
    maxSupply: String(value.maxSupply ?? "0"),
    treasury: String(value.treasury ?? ""),
    admin: String(value.admin ?? ""),
    ticketNftAddress: String(value.ticketNFT ?? ""),
    marketplaceAddress: String(value.marketplace ?? ""),
    checkInRegistryAddress: String(value.checkInRegistry ?? ""),
    deploymentBlock: toSafeNumber(value.deploymentBlock, "deploymentBlock"),
    registeredAt: toSafeNumber(value.registeredAt, "registeredAt"),
  };
}

export function decodeFactoryDeploymentResult(encodedResult: string): EventDeployment {
  const attempts = [
    { label: "v2", iface: FACTORY_V2_INTERFACE },
    { label: "v1", iface: FACTORY_V1_INTERFACE },
  ] as const;

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const [decoded] = attempt.iface.decodeFunctionResult("getEventAt", encodedResult);
      const deployment = parseFactoryDeployment(decoded);

      if (!deployment.ticketEventId || !deployment.name) {
        throw new Error("Factory deployment metadata is incomplete.");
      }

      assertAddress(deployment.treasury, "treasury");
      assertAddress(deployment.admin, "admin");
      assertAddress(deployment.ticketNftAddress, "ticketNFT");
      assertAddress(deployment.marketplaceAddress, "marketplace");
      assertAddress(deployment.checkInRegistryAddress, "checkInRegistry");

      return deployment;
    } catch (error) {
      errors.push(`${attempt.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Unable to decode factory deployment. Attempts: ${errors.join(" | ")}`);
}

export async function discoverFactoryEvents(
  contractConfig: ContractConfig,
  factoryAddress: string,
): Promise<EventDeployment[]> {
  const provider = new JsonRpcProvider(contractConfig.rpcUrl, contractConfig.chainId);
  const factory = new Contract(factoryAddress, CHAIN_TICKET_FACTORY_ABI, provider);
  const totalEvents = Number(await factory.totalEvents());

  if (totalEvents === 0) {
    return [];
  }

  const rawDeployments = await Promise.all(
    Array.from({ length: totalEvents }, async (_value, index) => {
      const callData = FACTORY_V2_INTERFACE.encodeFunctionData("getEventAt", [index]);
      const encodedResult = await provider.call({
        to: factoryAddress,
        data: callData,
      });
      return decodeFactoryDeploymentResult(encodedResult);
    }),
  );

  return rawDeployments;
}
