import { Contract, JsonRpcProvider, getAddress, type EventLog, type Provider } from "ethers";

import { COLLECTIBLE_NFT_ABI, MERCH_STORE_ABI, PERK_MANAGER_ABI } from "./abi.js";

export interface FanPerkSnapshot {
  perkId: string;
  artistKey: string;
  minScore: bigint;
  minAttendances: bigint;
  fuelCost: bigint;
  active: boolean;
  metadataURI: string;
  unlocked: boolean;
  redeemedCount: number;
  lastRedeemedTxHash: string | null;
}

export interface CollectibleSnapshot {
  collectibleId: bigint;
  owner: string;
  originFan: string;
  sourceTicketId: bigint;
  sourceTicketClass: number;
  level: bigint;
  tokenURI: string;
}

export interface MerchSkuSnapshot {
  skuId: string;
  price: bigint;
  stock: bigint;
  active: boolean;
}

export interface MerchRedemptionSnapshot {
  skuId: string;
  twinId: bigint;
  fan: string;
  fuelCost: bigint;
  txHash: string;
  blockNumber: number;
}

function normalizeAddress(address: string): string {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
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

function getProvider(rpcUrl: string, chainId: number, provider?: Provider): Provider {
  return provider ?? new JsonRpcProvider(rpcUrl, chainId);
}

function isEventLog(log: unknown): log is EventLog {
  return typeof log === "object" && log !== null && "args" in log;
}

function sortEventLogs(logs: EventLog[]): EventLog[] {
  return [...logs].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber - right.blockNumber;
    }
    return left.index - right.index;
  });
}

function parseCollectibleInfo(raw: unknown): {
  sourceTicketId: bigint;
  originFan: string;
  sourceTicketClass: number;
} {
  if (Array.isArray(raw)) {
    return {
      sourceTicketId: toBigInt(raw[0] ?? 0n),
      originFan: String(raw[1] ?? ""),
      sourceTicketClass: Number(raw[2] ?? 0),
    };
  }

  const value = raw as {
    sourceTicketId?: unknown;
    originFan?: unknown;
    sourceTicketClass?: unknown;
  };

  return {
    sourceTicketId: toBigInt(value.sourceTicketId ?? 0n),
    originFan: String(value.originFan ?? ""),
    sourceTicketClass: Number(value.sourceTicketClass ?? 0),
  };
}

function parseSku(raw: unknown, fallbackSkuId: string): MerchSkuSnapshot {
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

export async function getPerksForFanFromChain(args: {
  rpcUrl: string;
  chainId: number;
  perkManagerAddress: string;
  fan: string;
  fromBlock: number;
  provider?: Provider;
}): Promise<FanPerkSnapshot[]> {
  const provider = getProvider(args.rpcUrl, args.chainId, args.provider);
  const contract = new Contract(args.perkManagerAddress, PERK_MANAGER_ABI, provider);

  const [configuredLogs, redeemedLogs] = await Promise.all([
    contract.queryFilter(contract.filters.PerkConfigured(), args.fromBlock, "latest"),
    contract.queryFilter(contract.filters.PerkRedeemed(null, args.fan), args.fromBlock, "latest"),
  ]);

  const perkIds = Array.from(
    new Set(
      configuredLogs
        .filter(isEventLog)
        .map((log) => String(log.args[0] ?? ""))
        .filter((perkId) => perkId.length > 0),
    ),
  );

  const redeemedByPerk = new Map<string, { count: number; lastTxHash: string | null }>();
  for (const log of redeemedLogs.filter(isEventLog)) {
    const perkId = String(log.args[0] ?? "");
    if (!perkId) {
      continue;
    }

    const current = redeemedByPerk.get(perkId) ?? { count: 0, lastTxHash: null };
    redeemedByPerk.set(perkId, {
      count: current.count + 1,
      lastTxHash: log.transactionHash ?? current.lastTxHash,
    });
  }

  const perks = await Promise.all(
    perkIds.map(async (perkId): Promise<FanPerkSnapshot> => {
      const [perk, unlocked] = await Promise.all([
        contract.perkOf(perkId) as Promise<[string, bigint, bigint, bigint, boolean, string]>,
        contract.canAccess(args.fan, perkId) as Promise<boolean>,
      ]);
      const redemption = redeemedByPerk.get(perkId);

      return {
        perkId,
        artistKey: String(perk[0] ?? ""),
        minScore: toBigInt(perk[1] ?? 0n),
        minAttendances: toBigInt(perk[2] ?? 0n),
        fuelCost: toBigInt(perk[3] ?? 0n),
        active: Boolean(perk[4]),
        metadataURI: String(perk[5] ?? ""),
        unlocked: Boolean(unlocked),
        redeemedCount: redemption?.count ?? 0,
        lastRedeemedTxHash: redemption?.lastTxHash ?? null,
      };
    }),
  );

  return perks
    .filter((perk) => perk.active || perk.redeemedCount > 0)
    .sort((left, right) => {
      if (left.unlocked !== right.unlocked) {
        return left.unlocked ? -1 : 1;
      }
      if (left.active !== right.active) {
        return left.active ? -1 : 1;
      }
      return left.perkId.localeCompare(right.perkId);
    });
}

export async function getCollectiblesByOwnerFromChain(args: {
  rpcUrl: string;
  chainId: number;
  collectibleContractAddress: string;
  owner: string;
  fromBlock: number;
  provider?: Provider;
}): Promise<CollectibleSnapshot[]> {
  const provider = getProvider(args.rpcUrl, args.chainId, args.provider);
  const contract = new Contract(args.collectibleContractAddress, COLLECTIBLE_NFT_ABI, provider);
  const owner = normalizeAddress(args.owner);

  const [incoming, outgoing] = await Promise.all([
    contract.queryFilter(contract.filters.Transfer(null, owner), args.fromBlock, "latest"),
    contract.queryFilter(contract.filters.Transfer(owner, null), args.fromBlock, "latest"),
  ]);

  const ownedIds = new Set<string>();
  for (const log of sortEventLogs([...incoming, ...outgoing].filter(isEventLog))) {
    const from = normalizeAddress(String(log.args[0] ?? ""));
    const to = normalizeAddress(String(log.args[1] ?? ""));
    const tokenId = toBigInt(log.args[2] ?? 0n).toString();

    if (sameAddress(to, owner)) {
      ownedIds.add(tokenId);
    }
    if (sameAddress(from, owner)) {
      ownedIds.delete(tokenId);
    }
  }

  const collectibleIds = Array.from(ownedIds.values(), (value) => BigInt(value)).sort((left, right) =>
    left > right ? -1 : left < right ? 1 : 0,
  );

  const collectibles = await Promise.all(
    collectibleIds.map(async (collectibleId): Promise<CollectibleSnapshot | null> => {
      try {
        const [contractOwner, tokenURI, level, rawInfo] = await Promise.all([
          contract.ownerOf(collectibleId).then(String),
          contract.tokenURI(collectibleId).then(String),
          contract.levelOf(collectibleId).then((value: unknown) => toBigInt(value)),
          contract.collectibleInfo(collectibleId),
        ]);
        const info = parseCollectibleInfo(rawInfo);
        const normalizedOwner = normalizeAddress(contractOwner);

        if (!sameAddress(normalizedOwner, owner)) {
          return null;
        }

        return {
          collectibleId,
          owner: normalizedOwner,
          originFan: normalizeAddress(info.originFan),
          sourceTicketId: info.sourceTicketId,
          sourceTicketClass: info.sourceTicketClass,
          level,
          tokenURI,
        };
      } catch {
        return null;
      }
    }),
  );

  return collectibles.filter((collectible): collectible is CollectibleSnapshot => collectible !== null);
}

export async function getMerchCatalogFromChain(args: {
  rpcUrl: string;
  chainId: number;
  merchStoreAddress: string;
  fromBlock: number;
  provider?: Provider;
}): Promise<MerchSkuSnapshot[]> {
  const provider = getProvider(args.rpcUrl, args.chainId, args.provider);
  const contract = new Contract(args.merchStoreAddress, MERCH_STORE_ABI, provider);
  const configuredLogs = sortEventLogs(
    (
      await contract.queryFilter(contract.filters.SkuConfigured(), args.fromBlock, "latest")
    ).filter(isEventLog),
  );

  const orderedSkuIds: string[] = [];
  for (const log of configuredLogs) {
    const skuId = String(log.args[1] ?? "");
    if (!skuId || orderedSkuIds.includes(skuId)) {
      continue;
    }
    orderedSkuIds.push(skuId);
  }

  const skus = await Promise.all(
    orderedSkuIds.map(async (skuId): Promise<MerchSkuSnapshot | null> => {
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
    .filter((sku): sku is MerchSkuSnapshot => sku !== null)
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
}): Promise<MerchRedemptionSnapshot[]> {
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
