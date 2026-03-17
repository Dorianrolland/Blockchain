import { Contract, JsonRpcProvider } from "ethers";

import type { ContractConfig, EventDeployment } from "../types/chainticket";
import { CHAIN_TICKET_FACTORY_ABI, CHAIN_TICKET_FACTORY_V2_ABI } from "./abi";

export function getFallbackEventDeployment(config: ContractConfig): EventDeployment {
  return {
    ticketEventId: config.eventId ?? "main-event",
    name: config.eventName ?? "Main Event",
    symbol: "CTK",
    version: config.version ?? "v1",
    primaryPriceWei: "0",
    maxSupply: "0",
    treasury: "",
    admin: "",
    ticketNftAddress: config.ticketNftAddress,
    marketplaceAddress: config.marketplaceAddress,
    checkInRegistryAddress: config.checkInRegistryAddress,
    fanFuelBank: config.fanFuelBankAddress,
    perkManager: config.perkManagerAddress,
    merchStore: config.merchStoreAddress,
    insurancePool: config.insurancePoolAddress,
    deploymentBlock: config.deploymentBlock,
    registeredAt: 0,
  };
}

function readResultIndex(result: unknown[] | Record<number, unknown>, index: number): unknown {
  try {
    return result[index];
  } catch {
    return undefined;
  }
}

function isAddressLike(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parseFactoryDeployment(raw: unknown): EventDeployment {
  const value = raw as {
    eventId?: unknown;
    name?: unknown;
    symbol?: unknown;
    artistId?: unknown;
    seriesId?: unknown;
    primaryPrice?: unknown;
    maxSupply?: unknown;
    fanPassAllocationBps?: unknown;
    artistRoyaltyBps?: unknown;
    treasury?: unknown;
    admin?: unknown;
    ticketNFT?: unknown;
    marketplace?: unknown;
    checkInRegistry?: unknown;
    collectibleContract?: unknown;
    fanScoreRegistry?: unknown;
    fanFuelBank?: unknown;
    insurancePool?: unknown;
    oracleAdapter?: unknown;
    merchStore?: unknown;
    perkManager?: unknown;
    deploymentBlock?: unknown;
    registeredAt?: unknown;
  } & unknown[];
  const at = (index: number) => readResultIndex(value, index);
  const index3 = at(3);
  const index4 = at(4);
  const index5 = at(5);
  const index6 = at(6);
  const index7 = at(7);
  const index8 = at(8);
  const index9 = at(9);
  const index10 = at(10);
  const index11 = at(11);
  const index12 = at(12);
  const index13 = at(13);
  const index14 = at(14);
  const index15 = at(15);
  const index16 = at(16);
  const index17 = at(17);
  const index18 = at(18);
  const index19 = at(19);
  const index20 = at(20);
  const hasPerkManager =
    value.perkManager !== undefined || isAddressLike(index20);
  const isV2 =
    value.artistId !== undefined || (index3 !== undefined && typeof index3 === "string");
  const deploymentBlockIndex = hasPerkManager ? 21 : 20;
  const registeredAtIndex = hasPerkManager ? 22 : 21;

  return {
    ticketEventId: String(value.eventId ?? value[0] ?? ""),
    name: String(value.name ?? value[1] ?? ""),
    symbol: String(value.symbol ?? value[2] ?? ""),
    version: isV2 ? "v2" : "v1",
    artistId: isV2 ? String(value.artistId ?? index3 ?? "") : undefined,
    seriesId: isV2 ? String(value.seriesId ?? index4 ?? "") : undefined,
    primaryPriceWei: String(value.primaryPrice ?? index5 ?? index3 ?? "0"),
    maxSupply: String(value.maxSupply ?? index6 ?? index4 ?? "0"),
    fanPassAllocationBps:
      isV2 && (value.fanPassAllocationBps !== undefined || index7 !== undefined)
        ? String(value.fanPassAllocationBps ?? index7 ?? "0")
        : undefined,
    artistRoyaltyBps:
      isV2 && (value.artistRoyaltyBps !== undefined || index8 !== undefined)
        ? String(value.artistRoyaltyBps ?? index8 ?? "0")
        : undefined,
    treasury: String(value.treasury ?? index9 ?? index5 ?? ""),
    admin: String(value.admin ?? index10 ?? index6 ?? ""),
    ticketNftAddress: String(value.ticketNFT ?? index11 ?? index7 ?? ""),
    marketplaceAddress: String(value.marketplace ?? index12 ?? index8 ?? ""),
    checkInRegistryAddress: String(value.checkInRegistry ?? index13 ?? index9 ?? ""),
    collectibleContract:
      isV2 && (value.collectibleContract !== undefined || index14 !== undefined)
        ? String(value.collectibleContract ?? index14 ?? "")
        : undefined,
    fanScoreRegistry:
      isV2 && (value.fanScoreRegistry !== undefined || index15 !== undefined)
        ? String(value.fanScoreRegistry ?? index15 ?? "")
        : undefined,
    fanFuelBank:
      isV2 && (value.fanFuelBank !== undefined || index16 !== undefined)
        ? String(value.fanFuelBank ?? index16 ?? "")
        : undefined,
    insurancePool:
      isV2 && (value.insurancePool !== undefined || index17 !== undefined)
        ? String(value.insurancePool ?? index17 ?? "")
        : undefined,
    oracleAdapter:
      isV2 && (value.oracleAdapter !== undefined || index18 !== undefined)
        ? String(value.oracleAdapter ?? index18 ?? "")
        : undefined,
    merchStore:
      isV2 && (value.merchStore !== undefined || index19 !== undefined)
        ? String(value.merchStore ?? index19 ?? "")
        : undefined,
    perkManager:
      isV2 && hasPerkManager
        ? String(value.perkManager ?? index20 ?? "")
        : undefined,
    deploymentBlock: Number(
      value.deploymentBlock ?? at(deploymentBlockIndex) ?? index10 ?? 0,
    ),
    registeredAt: Number(
      value.registeredAt ?? at(registeredAtIndex) ?? index11 ?? 0,
    ),
  };
}

export async function discoverFactoryEvents(
  contractConfig: ContractConfig,
  factoryAddress: string,
): Promise<EventDeployment[]> {
  const provider = new JsonRpcProvider(contractConfig.rpcUrl, contractConfig.chainId);
  const factories = [
    new Contract(factoryAddress, CHAIN_TICKET_FACTORY_V2_ABI, provider),
    new Contract(factoryAddress, CHAIN_TICKET_FACTORY_ABI, provider),
  ];
  let lastError: unknown = null;

  for (const factory of factories) {
    try {
      const totalEvents = Number(await factory.totalEvents());

      if (totalEvents === 0) {
        return [];
      }

      const rawDeployments = await Promise.all(
        Array.from({ length: totalEvents }, async (_value, index) => factory.getEventAt(index)),
      );

      return rawDeployments.map((raw) => parseFactoryDeployment(raw));
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}
