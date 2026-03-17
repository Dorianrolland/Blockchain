import { Contract, JsonRpcProvider, type Provider } from "ethers";

import type { FanPerkView } from "../types/chainticket";
import { PERK_MANAGER_ABI } from "./abi";

interface GetPerksForFanArgs {
  rpcUrl: string;
  chainId: number;
  perkManagerAddress: string;
  fan: string;
  fromBlock: number;
  provider?: Provider;
}

export async function getPerksForFanFromChain(
  args: GetPerksForFanArgs,
): Promise<FanPerkView[]> {
  const provider = args.provider ?? new JsonRpcProvider(args.rpcUrl, args.chainId);
  const contract = new Contract(args.perkManagerAddress, PERK_MANAGER_ABI, provider);

  const [configuredLogs, redeemedLogs] = await Promise.all([
    contract.queryFilter(contract.filters.PerkConfigured(), args.fromBlock, "latest"),
    contract.queryFilter(contract.filters.PerkRedeemed(null, args.fan), args.fromBlock, "latest"),
  ]);

  const perkIds = Array.from(
    new Set(
      configuredLogs
        .map((log) => {
          const eventLog = log as { args?: unknown[] };
          return String(eventLog.args?.[0] ?? "");
        })
        .filter((perkId) => perkId.length > 0),
    ),
  );

  const redeemedByPerk = new Map<string, { count: number; lastTxHash: string | null }>();
  for (const log of redeemedLogs) {
    const eventLog = log as { args?: unknown[]; transactionHash?: string };
    const perkId = String(eventLog.args?.[0] ?? "");
    if (!perkId) {
      continue;
    }

    const current = redeemedByPerk.get(perkId) ?? { count: 0, lastTxHash: null };
    redeemedByPerk.set(perkId, {
      count: current.count + 1,
      lastTxHash: eventLog.transactionHash ?? current.lastTxHash,
    });
  }

  const perks = await Promise.all(
    perkIds.map(async (perkId): Promise<FanPerkView> => {
      const [perk, unlocked] = await Promise.all([
        contract.perkOf(perkId) as Promise<[string, bigint, bigint, bigint, boolean, string]>,
        contract.canAccess(args.fan, perkId) as Promise<boolean>,
      ]);
      const redemption = redeemedByPerk.get(perkId);

      return {
        perkId,
        artistKey: String(perk[0] ?? ""),
        minScore: BigInt(perk[1] ?? 0),
        minAttendances: BigInt(perk[2] ?? 0),
        fuelCost: BigInt(perk[3] ?? 0),
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
