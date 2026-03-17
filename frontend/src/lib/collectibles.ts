import { Contract, JsonRpcProvider, getAddress, type EventLog, type Provider } from "ethers";

import type { CollectibleView } from "../types/chainticket";
import { COLLECTIBLE_NFT_ABI } from "./abi";

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

function getProvider(
  rpcUrl: string,
  chainId: number,
  provider?: Provider,
): Provider {
  return provider ?? new JsonRpcProvider(rpcUrl, chainId);
}

function isEventLog(log: unknown): log is EventLog {
  return typeof log === "object" && log !== null && "args" in log;
}

export async function getCollectibleByIdFromChain(args: {
  rpcUrl: string;
  chainId: number;
  collectibleContractAddress: string;
  collectibleId: bigint;
  provider?: Provider;
}): Promise<CollectibleView> {
  const provider = getProvider(args.rpcUrl, args.chainId, args.provider);
  const contract = new Contract(args.collectibleContractAddress, COLLECTIBLE_NFT_ABI, provider);

  const [owner, tokenURI, level, rawInfo] = await Promise.all([
    contract.ownerOf(args.collectibleId).then(String),
    contract.tokenURI(args.collectibleId).then(String),
    contract.levelOf(args.collectibleId).then((value: unknown) => toBigInt(value)),
    contract.collectibleInfo(args.collectibleId),
  ]);
  const info = parseCollectibleInfo(rawInfo);

  return {
    collectibleId: args.collectibleId,
    owner: normalizeAddress(owner),
    originFan: normalizeAddress(info.originFan),
    sourceTicketId: info.sourceTicketId,
    sourceTicketClass: info.sourceTicketClass,
    level,
    tokenURI,
  };
}

export async function getCollectiblesByOwnerFromChain(args: {
  rpcUrl: string;
  chainId: number;
  collectibleContractAddress: string;
  owner: string;
  fromBlock: number;
  provider?: Provider;
}): Promise<CollectibleView[]> {
  const provider = getProvider(args.rpcUrl, args.chainId, args.provider);
  const contract = new Contract(args.collectibleContractAddress, COLLECTIBLE_NFT_ABI, provider);
  const owner = normalizeAddress(args.owner);

  const [incoming, outgoing] = await Promise.all([
    contract.queryFilter(contract.filters.Transfer(null, owner), args.fromBlock, "latest"),
    contract.queryFilter(contract.filters.Transfer(owner, null), args.fromBlock, "latest"),
  ]);

  const ownedIds = new Set<string>();

  const transferLogs = [...incoming, ...outgoing]
    .filter(isEventLog)
    .sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber - right.blockNumber;
      }
      return left.index - right.index;
    });

  for (const log of transferLogs) {
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
    collectibleIds.map(async (collectibleId): Promise<CollectibleView | null> => {
      try {
        const collectible = await getCollectibleByIdFromChain({
          rpcUrl: args.rpcUrl,
          chainId: args.chainId,
          collectibleContractAddress: args.collectibleContractAddress,
          collectibleId,
          provider,
        });

        if (!sameAddress(collectible.owner, owner)) {
          return null;
        }

        return collectible;
      } catch {
        return null;
      }
    }),
  );

  return collectibles.filter((collectible): collectible is CollectibleView => collectible !== null);
}
