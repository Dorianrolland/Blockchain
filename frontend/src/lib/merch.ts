import { Contract, JsonRpcProvider, type EventLog, getAddress, type Provider } from "ethers";

import type { MerchRedemptionView, MerchSkuView } from "../types/chainticket";
import { MERCH_STORE_ABI } from "./abi";

function normalizeAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    return BigInt((value as { toString: () => string }).toString());
  }
  return 0n;
}

function isEventLog(log: unknown): log is EventLog {
  return typeof log === "object" && log !== null && "args" in log;
}

function getProvider(rpcUrl: string, chainId: number, provider?: Provider): Provider {
  return provider ?? new JsonRpcProvider(rpcUrl, chainId);
}

function sortEventLogs(logs: EventLog[]): EventLog[] {
  return [...logs].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }
    return left.index - right.index;
  });
}

function parseSku(raw: unknown, fallbackSkuId: string): MerchSkuView {
  if (Array.isArray(raw)) {
    return {
      skuId: String(raw[0] ?? fallbackSkuId),
      price: toBigInt(raw[1] ?? 0n),
      stock: toBigInt(raw[2] ?? 0n),
      active: Boolean(raw[3]),
    };
  }

  const value = raw as {
    skuId?: unknown;
    price?: unknown;
    stock?: unknown;
    active?: unknown;
  };

  return {
    skuId: String(value.skuId ?? fallbackSkuId),
    price: toBigInt(value.price ?? 0n),
    stock: toBigInt(value.stock ?? 0n),
    active: Boolean(value.active),
  };
}

export async function getMerchCatalogFromChain(args: {
  rpcUrl: string;
  chainId: number;
  merchStoreAddress: string;
  fromBlock: number;
  provider?: Provider;
}): Promise<MerchSkuView[]> {
  const provider = getProvider(args.rpcUrl, args.chainId, args.provider);
  const contract = new Contract(args.merchStoreAddress, MERCH_STORE_ABI, provider);
  const skuLogs = sortEventLogs(
    (
      await contract.queryFilter(contract.filters.SkuConfigured(), args.fromBlock, "latest")
    ).filter(isEventLog),
  );

  const orderedSkuIds: string[] = [];
  for (const log of skuLogs) {
    const skuId = String(log.args[1] ?? "");
    if (!skuId || orderedSkuIds.includes(skuId)) {
      continue;
    }
    orderedSkuIds.push(skuId);
  }

  const skus = await Promise.all(
    orderedSkuIds.map(async (skuId): Promise<MerchSkuView | null> => {
      try {
        const rawSku = await contract.getSku(skuId);
        const sku = parseSku(rawSku, skuId);
        return sku.skuId.length > 0 ? sku : null;
      } catch {
        return null;
      }
    }),
  );

  return skus
    .filter((sku): sku is MerchSkuView => sku !== null)
    .sort((left, right) => {
      if (left.active !== right.active) {
        return left.active ? -1 : 1;
      }
      if (left.stock !== right.stock) {
        return left.stock > right.stock ? -1 : 1;
      }
      return left.skuId.localeCompare(right.skuId);
    });
}

export async function getMerchRedemptionsByFanFromChain(args: {
  rpcUrl: string;
  chainId: number;
  merchStoreAddress: string;
  fan: string;
  fromBlock: number;
  provider?: Provider;
}): Promise<MerchRedemptionView[]> {
  const provider = getProvider(args.rpcUrl, args.chainId, args.provider);
  const contract = new Contract(args.merchStoreAddress, MERCH_STORE_ABI, provider);
  const fan = normalizeAddress(args.fan);
  const logs = (
    await contract.queryFilter(contract.filters.Redeemed(null, null, fan), args.fromBlock, "latest")
  ).filter(isEventLog);

  return [...logs]
    .sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return right.blockNumber - left.blockNumber;
      }
      return right.index - left.index;
    })
    .map((log) => ({
      skuId: String(log.args[1] ?? ""),
      fan: normalizeAddress(String(log.args[2] ?? fan)),
      twinId: toBigInt(log.args[3] ?? 0n),
      fuelCost: toBigInt(log.args[4] ?? 0n),
      txHash: String(log.transactionHash ?? ""),
      blockNumber: Number(log.blockNumber ?? 0),
    }));
}
