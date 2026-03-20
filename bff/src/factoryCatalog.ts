import { Interface, isAddress } from "ethers";

import type { TicketEventDeployment } from "./types.js";

type FactoryReadMethod = "getEventAt" | "getEventById";

type FactoryReader = {
  call(transaction: { to: string; data: string }): Promise<string>;
};

const FACTORY_V1_FRAGMENTS = [
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,uint256 primaryPrice,uint256 maxSupply,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,uint256 deploymentBlock,uint256 registeredAt))",
  "function getEventById(string eventId) view returns ((string eventId,string name,string symbol,uint256 primaryPrice,uint256 maxSupply,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,uint256 deploymentBlock,uint256 registeredAt))",
] as const;

const FACTORY_V2_FRAGMENTS = [
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
  "function getEventById(string eventId) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
] as const;

const factoryV1Interface = new Interface(FACTORY_V1_FRAGMENTS);
const factoryV2Interface = new Interface(FACTORY_V2_FRAGMENTS);

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

function parseDecodedDeployment(raw: unknown): TicketEventDeployment {
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
  };

  const deployment = {
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
  } satisfies TicketEventDeployment;

  if (!deployment.ticketEventId) {
    throw new Error("Factory eventId is empty.");
  }
  if (!deployment.name) {
    throw new Error(`Factory deployment name is empty for ${deployment.ticketEventId}.`);
  }

  assertAddress(deployment.treasury, "treasury");
  assertAddress(deployment.admin, "admin");
  assertAddress(deployment.ticketNftAddress, "ticketNFT");
  assertAddress(deployment.marketplaceAddress, "marketplace");
  assertAddress(deployment.checkInRegistryAddress, "checkInRegistry");

  return deployment;
}

export function decodeFactoryDeploymentResult(
  method: FactoryReadMethod,
  encodedResult: string,
): TicketEventDeployment {
  const attempts = [
    { label: "v2", iface: factoryV2Interface },
    { label: "v1", iface: factoryV1Interface },
  ] as const;

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const [decoded] = attempt.iface.decodeFunctionResult(method, encodedResult);
      return parseDecodedDeployment(decoded);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${attempt.label}: ${message}`);
    }
  }

  throw new Error(
    `Unable to decode ${method} result from factory. Attempts: ${errors.join(" | ")}`,
  );
}

export async function readFactoryDeployment(
  reader: FactoryReader,
  factoryAddress: string,
  method: FactoryReadMethod,
  argument: number | string,
): Promise<TicketEventDeployment> {
  const callData = factoryV2Interface.encodeFunctionData(method, [argument]);
  const encodedResult = await reader.call({
    to: factoryAddress,
    data: callData,
  });
  return decodeFactoryDeploymentResult(method, encodedResult);
}
