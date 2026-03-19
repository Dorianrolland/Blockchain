import cors from "cors";
import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes, type TypedDataField } from "ethers";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import {
  COLLECTIBLE_NFT_ABI,
  FACTORY_ABI,
  FACTORY_V2_ABI,
  FAN_FUEL_BANK_ABI,
  FAN_SCORE_REGISTRY_ABI,
  INSURANCE_POOL_ABI,
  TICKET_NFT_ABI,
} from "./abi.js";
import { config } from "./config.js";
import { mergeDemoCatalogEntries } from "./demoCatalog.js";
import {
  buildDemoTicketMetadata,
  buildDemoTicketSvg,
  isDemoAssetVariant,
} from "./demoAssets.js";
import {
  getCollectiblesByOwnerFromChain,
  getMerchCatalogFromChain,
  getMerchRedemptionsByFanFromChain,
  getPerksForFanFromChain,
} from "./chainViews.js";
import { logger, requestLogger } from "./logger.js";
import {
  getActiveListings,
  getDemoCatalogEntries,
  getEventDeployments as getStoredEventDeployments,
  getFanTicketProfileStats,
  getIndexedBlock,
  getMarketStats,
  getOperationalSummary,
  getTicketTimeline,
  getTicketsByOwner,
} from "./repository.js";
import {
  addressParamSchema,
  eventQuerySchema,
  listingsQuerySchema,
  tokenIdParamSchema,
} from "./validators.js";
import type { ChainIndexer, IndexerStatus } from "./indexer.js";
import { metrics } from "./metrics.js";
import type { ChainEventPayload, TicketEventDeployment } from "./types.js";

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

type HealthAlertSeverity = "warning" | "critical";

interface HealthAlert {
  code: string;
  severity: HealthAlertSeverity;
  message: string;
}

const FAN_PASS_ATTESTATION_TYPES: Record<string, TypedDataField[]> = {
  FanPassAttestation: [
    { name: "buyer", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
};

function toTierLabel(tierLevel: number): "base" | "silver" | "gold" | "platinum" {
  if (tierLevel >= 3) {
    return "platinum";
  }
  if (tierLevel >= 2) {
    return "gold";
  }
  if (tierLevel >= 1) {
    return "silver";
  }
  return "base";
}

function buildHealthAlerts(input: {
  indexedBlock: number;
  latestBlock: number | null;
  rpcHealthy: boolean;
  indexerStatus: IndexerStatus;
  checkedAt: number;
  configuredDeploymentBlock: number;
}): {
  lag: number | null;
  stalenessMs: number | null;
  alerts: HealthAlert[];
  degraded: boolean;
  ok: boolean;
  readModelReady: boolean;
} {
  const alerts: HealthAlert[] = [];
  const lag =
    input.latestBlock === null ? null : Math.max(0, input.latestBlock - input.indexedBlock);
  const stalenessMs =
    input.indexerStatus.lastProcessedAt === null
      ? null
      : Math.max(0, input.checkedAt - input.indexerStatus.lastProcessedAt);

  if (!input.rpcHealthy) {
    alerts.push({
      code: "rpc_unhealthy",
      severity: "critical",
      message: "Latest RPC health probe failed.",
    });
  }

  if (input.indexerStatus.haltedByRateLimit) {
    alerts.push({
      code: "indexer_halted",
      severity: "critical",
      message:
        input.indexerStatus.haltedReason ??
        "Indexer halted after repeated RPC rate limiting.",
    });
  }

  if (lag !== null) {
    if (lag >= config.healthLagCriticalBlocks) {
      alerts.push({
        code: "indexer_lag",
        severity: "critical",
        message: `Indexer lag is ${lag} blocks, above the critical threshold of ${config.healthLagCriticalBlocks}.`,
      });
    } else if (lag >= config.healthLagWarnBlocks) {
      alerts.push({
        code: "indexer_lag",
        severity: "warning",
        message: `Indexer lag is ${lag} blocks, above the warning threshold of ${config.healthLagWarnBlocks}.`,
      });
    }
  }

  if (input.indexerStatus.consecutiveRateLimitErrors >= config.healthRateLimitStreakWarn) {
    alerts.push({
      code: "rate_limit_streak",
      severity: "warning",
      message: `Indexer has ${input.indexerStatus.consecutiveRateLimitErrors} consecutive RPC rate-limit errors.`,
    });
  }

  if (lag !== null && lag > 0 && input.indexerStatus.running) {
    if (stalenessMs === null) {
      alerts.push({
        code: "indexer_stalled",
        severity: "warning",
        message: "Indexer has lag but no successful block range has been processed yet.",
      });
    } else if (stalenessMs >= config.healthStallCriticalMs) {
      alerts.push({
        code: "indexer_stalled",
        severity: "critical",
        message: `Indexer has not completed a range for ${stalenessMs} ms, above the critical threshold of ${config.healthStallCriticalMs} ms.`,
      });
    } else if (stalenessMs >= config.healthStallWarnMs) {
      alerts.push({
        code: "indexer_stalled",
        severity: "warning",
        message: `Indexer has not completed a range for ${stalenessMs} ms, above the warning threshold of ${config.healthStallWarnMs} ms.`,
      });
    }
  }

  const degraded = alerts.length > 0;
  const ok = !alerts.some((alert) => alert.severity === "critical");
  const readModelReady =
    input.rpcHealthy && ok && input.indexedBlock >= input.configuredDeploymentBlock;

  return { lag, stalenessMs, alerts, degraded, ok, readModelReady };
}

function timelineDescription(row: {
  event_type: string;
  actor_from: string | null;
  actor_to: string | null;
  seller: string | null;
  buyer: string | null;
  scanner: string | null;
  collectible_enabled: boolean | null;
  price_wei: string | null;
}): string {
  switch (row.event_type) {
    case "transfer":
      if ((row.actor_from ?? "").toLowerCase() === "0x0000000000000000000000000000000000000000") {
        return `Primary mint to ${row.actor_to ?? "unknown"}`;
      }
      return `Transfer from ${row.actor_from ?? "unknown"} to ${row.actor_to ?? "unknown"}`;
    case "listed":
      return `Listed by ${row.seller ?? "unknown"} at ${row.price_wei ?? "0"} wei`;
    case "cancelled":
      return "Listing cancelled";
    case "sold":
      return `Sold from ${row.seller ?? "unknown"} to ${row.buyer ?? "unknown"}`;
    case "used":
      return `Checked-in by scanner ${row.scanner ?? "unknown"}`;
    case "collectible_mode":
      return row.collectible_enabled ? "Collectible mode enabled" : "Collectible mode disabled";
    default:
      return "Event";
  }
}

function timelineKind(row: { event_type: string; actor_from: string | null }):
  | "mint"
  | "transfer"
  | "listed"
  | "cancelled"
  | "sold"
  | "used"
  | "collectible" {
  if (row.event_type === "transfer") {
    if ((row.actor_from ?? "").toLowerCase() === "0x0000000000000000000000000000000000000000") {
      return "mint";
    }
    return "transfer";
  }

  if (row.event_type === "listed") {
    return "listed";
  }
  if (row.event_type === "cancelled") {
    return "cancelled";
  }
  if (row.event_type === "sold") {
    return "sold";
  }
  if (row.event_type === "used") {
    return "used";
  }
  return "collectible";
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

function parseFactoryDeployment(raw: unknown): TicketEventDeployment {
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

export function createApp(indexer: ChainIndexer) {
  const app = express();
  const allowedOrigins = new Set(config.corsOrigins);
  const exemptFromGlobalRateLimit = new Set([
    "/v1/health",
    "/v1/system",
    "/v1/events",
    "/v1/events/stream",
  ]);
  const catalogProvider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const fanPassAttestationWallet = config.fanPassAttestationPrivateKey
    ? new Wallet(config.fanPassAttestationPrivateKey)
    : null;
  const factoryContract = config.factoryAddress
    ? new Contract(config.factoryAddress, FACTORY_ABI, catalogProvider)
    : null;
  const factoryContractV2 = config.factoryAddress
    ? new Contract(config.factoryAddress, FACTORY_V2_ABI, catalogProvider)
    : null;
  let catalogCache: { items: TicketEventDeployment[]; cachedAt: number } | null = null;
  type SystemStatePayload = Awaited<ReturnType<ChainIndexer["getCurrentSystemState"]>> & {
    ticketEventId: string;
  };
  const systemStateCache = new Map<string, { value: SystemStatePayload; cachedAt: number }>();

  const setDemoAssetResponseHeaders = (
    response: Response,
    contentType: "application/json; charset=utf-8" | "image/svg+xml; charset=utf-8",
  ) => {
    response.setHeader("Content-Type", contentType);
    response.setHeader("Cache-Control", "public, max-age=60");
    // Demo ticket media is rendered from the frontend origin (`localhost:5173` in dev).
    // Helmet defaults to `Cross-Origin-Resource-Policy: same-origin`, which makes
    // cross-origin `<img>` / poster requests fail with `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`.
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  };

  const issueFanPassAttestation = async (
    event: TicketEventDeployment,
    buyerAddress: string,
  ): Promise<{
    signer: string;
    deadline: bigint;
    signature: string;
  }> => {
    if ((event.version ?? "v1") !== "v2") {
      throw new Error("FanPass attestations are only available for upgraded events.");
    }
    if (!fanPassAttestationWallet) {
      throw new Error("FanPass attestation service is not configured.");
    }

    const ticketContract = new Contract(event.ticketNftAddress, TICKET_NFT_ABI, catalogProvider);
    const [ticketName, onChainAttestationSigner] = await Promise.all([
      ticketContract.name().then(String),
      ticketContract.attestationSigner().then(String),
    ]);

    if (fanPassAttestationWallet.address.toLowerCase() !== onChainAttestationSigner.toLowerCase()) {
      throw new Error("Configured FanPass attestation signer does not match the on-chain signer.");
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + config.fanPassAttestationTtlSeconds);
    const signature = await fanPassAttestationWallet.signTypedData(
      {
        name: ticketName,
        version: "2",
        chainId: config.chainId,
        verifyingContract: event.ticketNftAddress,
      },
      FAN_PASS_ATTESTATION_TYPES,
      {
        buyer: buyerAddress,
        deadline,
      },
    );

    return {
      signer: fanPassAttestationWallet.address,
      deadline,
      signature,
    };
  };

  const getFactoryCatalogFromContract = async (
    contract: Contract,
  ): Promise<TicketEventDeployment[]> => {
    const totalEvents = Number(await contract.totalEvents());
    const rawDeployments = await Promise.all(
      Array.from({ length: totalEvents }, async (_value, index) => contract.getEventAt(index)),
    );
    return rawDeployments.map((raw) => parseFactoryDeployment(raw));
  };

  const getFactoryCatalog = async (): Promise<TicketEventDeployment[]> => {
    let lastError: unknown = null;
    for (const candidate of [factoryContractV2, factoryContract]) {
      if (!candidate) {
        continue;
      }

      try {
        return await getFactoryCatalogFromContract(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return [];
  };

  const getEventCatalog = async (): Promise<TicketEventDeployment[]> => {
    if (catalogCache && Date.now() - catalogCache.cachedAt < 30_000) {
      return catalogCache.items;
    }

    let items = await getStoredEventDeployments();
    const activeDemoEntries = await getDemoCatalogEntries("active");
    const missingActiveDeployments =
      activeDemoEntries.length > 0 &&
      activeDemoEntries.some(
        (entry) => !items.some((item) => item.ticketEventId === entry.ticketEventId),
      );

    if (factoryContract && (items.length === 0 || missingActiveDeployments)) {
      try {
        const factoryItems = await getFactoryCatalog();

        if (items.length === 0) {
          items = factoryItems;
        } else {
          const byId = new Map(items.map((item) => [item.ticketEventId, item] as const));
          for (const deployment of factoryItems) {
            if (!byId.has(deployment.ticketEventId)) {
              byId.set(deployment.ticketEventId, deployment);
            }
          }
          items = [...byId.values()];
        }
      } catch (error) {
        logger.warn(
          {
            error: normalizeError(error),
            storedCount: items.length,
            activeDemoCount: activeDemoEntries.length,
            usedCatalogCacheFallback: Boolean(catalogCache),
          },
          "Falling back to stored event catalog after factory lookup failed.",
        );

        if (items.length === 0 && catalogCache) {
          return catalogCache.items;
        }
      }
    }

    if (items.length === 0) {
      items = [
        {
          ticketEventId: config.defaultEventId,
          name: config.defaultEventId,
          symbol: "CTK",
          primaryPriceWei: "0",
          maxSupply: "0",
          treasury: "",
          admin: "",
          ticketNftAddress: config.ticketNftAddress ?? "",
          marketplaceAddress: config.marketplaceAddress ?? "",
          checkInRegistryAddress: config.checkInRegistryAddress ?? "",
          deploymentBlock: config.deploymentBlock,
          registeredAt: 0,
        },
      ];
      }
      items = mergeDemoCatalogEntries(items, activeDemoEntries);
      const preferredIndex = items.findIndex(
        (item) => item.ticketEventId === config.defaultEventId,
      );
      if (preferredIndex > 0) {
        const preferred = items[preferredIndex]!;
        items = [preferred, ...items.slice(0, preferredIndex), ...items.slice(preferredIndex + 1)];
      }

      catalogCache = {
        items,
      cachedAt: Date.now(),
    };
    return items;
  };

  const getIndexerHealth = async (): Promise<{
    checkedAt: number;
    indexedBlock: number;
    latestBlock: number | null;
    rpcHealthy: boolean;
    indexerStatus: IndexerStatus;
    configuredDeploymentBlock: number;
  }> => {
    const indexerStatus = indexer.getStatus();
    const configuredDeploymentBlock = indexer.getDeploymentFloor();
    const indexedBlock = Math.max(
      await getIndexedBlock(),
      configuredDeploymentBlock - 1,
    );
    let latestBlock: number | null = null;
    let rpcHealthy = true;
    const checkedAt = Date.now();

    try {
      latestBlock = await indexer.getLatestChainBlock();
    } catch {
      rpcHealthy = false;
    }

    return {
      checkedAt,
      indexedBlock,
      latestBlock,
      rpcHealthy,
      indexerStatus,
      configuredDeploymentBlock,
    };
  };

  const readSystemStateFromChain = async (
    event: TicketEventDeployment,
  ): Promise<Awaited<ReturnType<ChainIndexer["getCurrentSystemState"]>>> => {
    const ticketContract = new Contract(event.ticketNftAddress, TICKET_NFT_ABI, catalogProvider);

    const [
      insurancePremiumWei,
      primaryPrice,
      maxSupply,
      totalMinted,
      maxPerWallet,
      fanPassSupplyCap,
      fanPassMinted,
      paused,
      collectibleMode,
      baseUris,
    ] = await Promise.all([
      ticketContract.insurancePremium().then(String).catch(() => null),
      ticketContract.primaryPrice(),
      ticketContract.maxSupply(),
      ticketContract.totalMinted(),
      ticketContract.maxPerWallet(),
      ticketContract.fanPassSupplyCap().then(String).catch(() => null),
      ticketContract.fanPassMinted().then(String).catch(() => null),
      ticketContract.paused().catch(() => false),
      ticketContract.collectibleMode().catch(() => false),
      ticketContract.baseUris().catch(() => ({
        baseTokenURI: "",
        collectibleBaseURI: "",
      })),
    ]);

    return {
      version: (event.version ?? "v1") === "v2" ? "v2" : "v1",
      primaryPriceWei: String(primaryPrice),
      insurancePremiumWei,
      maxSupply: String(maxSupply),
      totalMinted: String(totalMinted),
      maxPerWallet: String(maxPerWallet),
      fanPassSupplyCap,
      fanPassMinted,
      paused: Boolean(paused),
      collectibleMode: Boolean(collectibleMode),
      baseTokenURI: String(baseUris.baseTokenURI ?? ""),
      collectibleBaseURI: String(baseUris.collectibleBaseURI ?? ""),
    };
  };

  const getSystemStateSnapshot = async (ticketEventId: string): Promise<SystemStatePayload> => {
    const cached = systemStateCache.get(ticketEventId);
    if (cached && Date.now() - cached.cachedAt < 1_000) {
      return cached.value;
    }

    let state: Awaited<ReturnType<ChainIndexer["getCurrentSystemState"]>>;
    try {
      state = await indexer.getCurrentSystemState(ticketEventId);
    } catch (error) {
      const message = normalizeError(error);
      if (!message.includes("Unknown ticket event id")) {
        throw error;
      }

      const event = await getEventCatalogEntry(ticketEventId);
      state = await readSystemStateFromChain(event);
    }

    const nextValue: SystemStatePayload = {
      ticketEventId,
      ...state,
    };
    systemStateCache.set(ticketEventId, {
      value: nextValue,
      cachedAt: Date.now(),
    });

    return nextValue;
  };

  const resolveTicketEventId = async (requested?: string): Promise<string> => {
    const catalog = await getEventCatalog();
    if (catalog.length === 0) {
      throw new Error("No ticket events are available.");
    }

    if (requested) {
      if (!catalog.some((item) => item.ticketEventId === requested)) {
        throw new Error(`Unknown ticket event id: ${requested}`);
      }
      return requested;
    }

    return (
      catalog.find((item) => item.ticketEventId === config.defaultEventId)?.ticketEventId ??
      catalog[0]?.ticketEventId ??
      config.defaultEventId
    );
  };

  const getEventCatalogEntry = async (ticketEventId: string): Promise<TicketEventDeployment> => {
    const catalog = await getEventCatalog();
    const event = catalog.find((item) => item.ticketEventId === ticketEventId);
    if (!event) {
      throw new Error(`Unknown ticket event id: ${ticketEventId}`);
    }
    return event;
  };

  const resolveDemoAssetRequest = async (params: {
    ticketEventId: string;
    tokenId: string;
    variant: string;
  }): Promise<{
    event: TicketEventDeployment;
    tokenId: bigint;
    variant: "live" | "collectible";
  }> => {
    if (!isDemoAssetVariant(params.variant)) {
      throw new Error(`Unsupported demo asset variant: ${params.variant}`);
    }

    if (!/^\d+$/.test(params.tokenId)) {
      throw new Error(`Invalid tokenId: ${params.tokenId}`);
    }

    const catalog = await getEventCatalog();
    const event = catalog.find((item) => item.ticketEventId === params.ticketEventId);
    if (!event) {
      throw new Error(`Unknown ticket event id: ${params.ticketEventId}`);
    }
    if (!event.isDemoInspired) {
      throw new Error(`Demo assets are only available for demo-inspired events: ${params.ticketEventId}`);
    }

    const tokenId = BigInt(params.tokenId);
    const maxSupply = BigInt(event.maxSupply || "0");
    if (tokenId < 0n) {
      throw new Error(`tokenId must be greater than or equal to 0 for ${params.ticketEventId}`);
    }
    if (maxSupply > 0n && tokenId > maxSupply) {
      throw new Error(
        `tokenId ${params.tokenId} is outside the max supply for ${params.ticketEventId}`,
      );
    }

    return {
      event,
      tokenId,
      variant: params.variant,
    };
  };

  app.set("trust proxy", 1);
  app.use(requestLogger);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin not allowed by CORS"));
      },
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
    }),
  );
  app.use(
    helmet({
      // This service is API-only; a document-level CSP belongs on the frontend origin.
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (request) =>
        request.method === "GET" &&
        exemptFromGlobalRateLimit.has(request.path),
    }),
  );
  app.use(express.json({ limit: "64kb" }));

  app.get("/demo-assets/:ticketEventId/:variant/:tokenId.json", async (request, response, next) => {
    try {
      const asset = await resolveDemoAssetRequest({
        ticketEventId: request.params.ticketEventId ?? "",
        tokenId: request.params.tokenId ?? "",
        variant: request.params.variant ?? "",
      });
      const origin = `${request.protocol}://${request.get("host") ?? `localhost:${config.port}`}`;

      setDemoAssetResponseHeaders(response, "application/json; charset=utf-8");
      response.json(
        buildDemoTicketMetadata({
          event: asset.event,
          tokenId: asset.tokenId,
          variant: asset.variant,
          origin,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/demo-assets/:ticketEventId/:variant/:tokenId.svg", async (request, response, next) => {
    try {
      const asset = await resolveDemoAssetRequest({
        ticketEventId: request.params.ticketEventId ?? "",
        tokenId: request.params.tokenId ?? "",
        variant: request.params.variant ?? "",
      });

      setDemoAssetResponseHeaders(response, "image/svg+xml; charset=utf-8");
      response.send(
        buildDemoTicketSvg({
          event: asset.event,
          tokenId: asset.tokenId,
          variant: asset.variant,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/health", async (_request, response, next) => {
    try {
      const {
        checkedAt,
        indexerStatus,
        indexedBlock,
        latestBlock,
        rpcHealthy,
        configuredDeploymentBlock,
      } =
        await getIndexerHealth();
      const health = buildHealthAlerts({
        checkedAt,
        indexedBlock,
        latestBlock,
        rpcHealthy,
        indexerStatus,
        configuredDeploymentBlock,
      });

      response.json({
        ok: health.ok,
        degraded: health.degraded,
        checkedAt,
        indexedBlock,
        latestBlock,
        lag: health.lag,
        stalenessMs: health.stalenessMs,
        rpcHealthy,
        readModelReady: health.readModelReady,
        configuredDeploymentBlock,
        alerts: health.alerts,
        indexer: indexerStatus,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/metrics", async (_request, response, next) => {
    try {
      const {
        checkedAt,
        indexerStatus,
        indexedBlock,
        latestBlock,
        rpcHealthy,
        configuredDeploymentBlock,
      } =
        await getIndexerHealth();
      const health = buildHealthAlerts({
        checkedAt,
        indexedBlock,
        latestBlock,
        rpcHealthy,
        indexerStatus,
        configuredDeploymentBlock,
      });
      response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      response.send(
        metrics.renderPrometheus({
          indexedBlock,
          latestBlock,
          rpcHealthy,
          healthOk: health.ok,
          degraded: health.degraded,
          stalenessMs: health.stalenessMs,
          alerts: health.alerts,
          indexer: indexerStatus,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/system", async (request, response, next) => {
    try {
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const system = await getSystemStateSnapshot(ticketEventId);
      response.json(system);
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/events", async (_request, response, next) => {
    try {
      const items = await getEventCatalog();
      const defaultEventId =
        items.find((item) => item.ticketEventId === config.defaultEventId)?.ticketEventId ??
        items[0]?.ticketEventId ??
        config.defaultEventId;
      response.json({
        items,
        defaultEventId,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/ops/summary", async (request, response, next) => {
    try {
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const summary = await getOperationalSummary(ticketEventId);
      response.json({
        ticketEventId,
        roles: summary.roles.map((role) => ({
          ticketEventId: role.ticketEventId,
          contractScope: role.contractScope,
          roleId: role.roleId,
          account: role.account,
          grantedBy: role.grantedBy,
          isActive: role.isActive,
          updatedBlock: role.updatedBlock,
          updatedTxHash: role.updatedTxHash,
        })),
        recentActivity: summary.recentActivity.map((activity) => ({
          id: activity.id,
          ticketEventId: activity.ticketEventId,
          contractScope: activity.contractScope,
          type: activity.type,
          roleId: activity.roleId ?? null,
          account: activity.account ?? null,
          actor: activity.actor ?? null,
          blockNumber: activity.blockNumber,
          txHash: activity.txHash,
          timestamp: activity.timestamp,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/listings", async (request, response, next) => {
    try {
      const query = listingsQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const result = await getActiveListings({
        ticketEventId,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      });
      response.json({
        ticketEventId,
        items: result.items.map((item) => ({
          ticketEventId: item.ticket_event_id,
          tokenId: item.token_id,
          seller: item.seller,
          priceWei: item.price_wei,
          isActive: item.is_active,
          updatedBlock: Number(item.updated_block),
        })),
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
        sort: query.sort,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/market/stats", async (_request, response, next) => {
    try {
      const query = eventQuerySchema.parse(_request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const stats = await getMarketStats(ticketEventId);
      response.json({
        ticketEventId,
        ...stats,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/users/:address/tickets", async (request, response, next) => {
    try {
      const params = addressParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const tickets = await getTicketsByOwner(params.address, ticketEventId);
      response.json({
        ticketEventId,
        address: params.address,
        items: tickets.map((ticket) => ({
          ticketEventId: ticket.ticket_event_id,
          tokenId: ticket.token_id,
          owner: ticket.owner,
          used: ticket.used,
          tokenURI: ticket.token_uri,
          listed: ticket.listed,
          listingPriceWei: ticket.listing_price_wei,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/fans/:address/profile", async (request, response, next) => {
    try {
      const params = addressParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const event = await getEventCatalogEntry(ticketEventId);
      const ticketStats = await getFanTicketProfileStats(params.address, ticketEventId);

      const artistKey =
        event.artistId && event.artistId.length > 0
          ? keccak256(toUtf8Bytes(event.artistId))
          : null;

      const [reputationScore, tierLevel, fuelBalance, artistAttendanceCount, collectibleCount] =
        await Promise.all([
          event.fanScoreRegistry
            ? new Contract(event.fanScoreRegistry, FAN_SCORE_REGISTRY_ABI, catalogProvider)
                .reputationOf(params.address)
                .then(String)
                .catch(() => "0")
            : Promise.resolve("0"),
          event.fanScoreRegistry
            ? new Contract(event.fanScoreRegistry, FAN_SCORE_REGISTRY_ABI, catalogProvider)
                .tierOf(params.address)
                .then((value: bigint) => Number(value))
                .catch(() => 0)
            : Promise.resolve(0),
          event.fanFuelBank
            ? new Contract(event.fanFuelBank, FAN_FUEL_BANK_ABI, catalogProvider)
                .balanceOf(params.address)
                .then(String)
                .catch(() => "0")
            : Promise.resolve("0"),
          event.fanScoreRegistry && artistKey
            ? new Contract(event.fanScoreRegistry, FAN_SCORE_REGISTRY_ABI, catalogProvider)
                .artistAttendanceOf(params.address, artistKey)
                .then(String)
                .catch(() => "0")
            : Promise.resolve("0"),
          event.collectibleContract
            ? new Contract(event.collectibleContract, COLLECTIBLE_NFT_ABI, catalogProvider)
                .balanceOf(params.address)
                .then(String)
                .catch(() => "0")
            : Promise.resolve("0"),
        ]);

      response.json({
        ticketEventId,
        address: params.address,
        version: event.version ?? "v1",
        artistId: event.artistId ?? null,
        seriesId: event.seriesId ?? null,
        reputationScore,
        tierLevel,
        tierLabel: toTierLabel(tierLevel),
        fuelBalance,
        artistAttendanceCount,
        currentTicketCount: ticketStats.currentTicketCount,
        listedTicketCount: ticketStats.listedTicketCount,
        collectibleCount,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/fans/:address/collectibles", async (request, response, next) => {
    try {
      const params = addressParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const event = await getEventCatalogEntry(ticketEventId);

      if ((event.version ?? "v1") !== "v2" || !event.collectibleContract) {
        response.json({
          ticketEventId,
          address: params.address,
          items: [],
        });
        return;
      }

      const collectibles = await getCollectiblesByOwnerFromChain({
        rpcUrl: config.rpcUrl,
        chainId: config.chainId,
        collectibleContractAddress: event.collectibleContract,
        owner: params.address,
        fromBlock: event.deploymentBlock,
        provider: catalogProvider,
      });

      response.json({
        ticketEventId,
        address: params.address,
        items: collectibles.map((collectible) => ({
          collectibleId: collectible.collectibleId.toString(),
          owner: collectible.owner,
          originFan: collectible.originFan,
          sourceTicketId: collectible.sourceTicketId.toString(),
          sourceTicketClass: collectible.sourceTicketClass,
          level: collectible.level.toString(),
          tokenURI: collectible.tokenURI,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/fans/:address/perks", async (request, response, next) => {
    try {
      const params = addressParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const event = await getEventCatalogEntry(ticketEventId);

      if ((event.version ?? "v1") !== "v2" || !event.perkManager) {
        response.json({
          ticketEventId,
          address: params.address,
          items: [],
        });
        return;
      }

      const perks = await getPerksForFanFromChain({
        rpcUrl: config.rpcUrl,
        chainId: config.chainId,
        perkManagerAddress: event.perkManager,
        fan: params.address,
        fromBlock: event.deploymentBlock,
        provider: catalogProvider,
      });

      response.json({
        ticketEventId,
        address: params.address,
        items: perks.map((perk) => ({
          perkId: perk.perkId,
          artistKey: perk.artistKey,
          minScore: perk.minScore.toString(),
          minAttendances: perk.minAttendances.toString(),
          fuelCost: perk.fuelCost.toString(),
          active: perk.active,
          metadataURI: perk.metadataURI,
          unlocked: perk.unlocked,
          redeemedCount: perk.redeemedCount,
          lastRedeemedTxHash: perk.lastRedeemedTxHash,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/merch/catalog", async (request, response, next) => {
    try {
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const event = await getEventCatalogEntry(ticketEventId);

      if ((event.version ?? "v1") !== "v2" || !event.merchStore) {
        response.json({
          ticketEventId,
          items: [],
        });
        return;
      }

      const catalog = await getMerchCatalogFromChain({
        rpcUrl: config.rpcUrl,
        chainId: config.chainId,
        merchStoreAddress: event.merchStore,
        fromBlock: event.deploymentBlock,
        provider: catalogProvider,
      });

      response.json({
        ticketEventId,
        items: catalog.map((sku) => ({
          skuId: sku.skuId,
          price: sku.price.toString(),
          stock: sku.stock.toString(),
          active: sku.active,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/fans/:address/merch-redemptions", async (request, response, next) => {
    try {
      const params = addressParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const event = await getEventCatalogEntry(ticketEventId);

      if ((event.version ?? "v1") !== "v2" || !event.merchStore) {
        response.json({
          ticketEventId,
          address: params.address,
          items: [],
        });
        return;
      }

      const redemptions = await getMerchRedemptionsByFanFromChain({
        rpcUrl: config.rpcUrl,
        chainId: config.chainId,
        merchStoreAddress: event.merchStore,
        fan: params.address,
        fromBlock: event.deploymentBlock,
        provider: catalogProvider,
      });

      response.json({
        ticketEventId,
        address: params.address,
        items: redemptions.map((redemption) => ({
          skuId: redemption.skuId,
          twinId: redemption.twinId.toString(),
          fan: redemption.fan,
          fuelCost: redemption.fuelCost.toString(),
          txHash: redemption.txHash,
          blockNumber: redemption.blockNumber,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/fans/:address/fanpass-attestation", async (request, response, next) => {
    try {
      const params = addressParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const event = await getEventCatalogEntry(ticketEventId);
      const attestation = await issueFanPassAttestation(event, params.address);

      response.json({
        ticketEventId,
        address: params.address,
        signer: attestation.signer,
        deadline: attestation.deadline.toString(),
        signature: attestation.signature,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/tickets/:tokenId/timeline", async (request, response, next) => {
    try {
      const params = tokenIdParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const rows = await getTicketTimeline(params.tokenId, ticketEventId);
      response.json({
        ticketEventId,
        tokenId: params.tokenId,
        items: rows.map((row) => ({
          id: row.chain_event_id,
          tokenId: row.token_id ?? params.tokenId,
          kind: timelineKind(row),
          blockNumber: Number(row.block_number),
          txHash: row.tx_hash,
          timestamp: row.block_timestamp ? Number(row.block_timestamp) : null,
          description: timelineDescription(row),
          from: row.actor_from ?? undefined,
          to: row.actor_to ?? undefined,
          seller: row.seller ?? undefined,
          buyer: row.buyer ?? undefined,
          scanner: row.scanner ?? undefined,
          priceWei: row.price_wei ?? undefined,
          feeAmountWei: row.fee_amount_wei ?? undefined,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/tickets/:tokenId/coverage", async (request, response, next) => {
    try {
      const params = tokenIdParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const event = await getEventCatalogEntry(ticketEventId);

      if ((event.version ?? "v1") !== "v2" || !event.insurancePool) {
        response.json({
          ticketEventId,
          tokenId: params.tokenId,
          supported: false,
          insured: false,
          claimed: false,
          claimable: false,
          payoutBps: 0,
          weatherRoundId: "0",
          premiumPaidWei: "0",
          payoutAmountWei: "0",
          policyActive: false,
          reportHash: null,
        });
        return;
      }

      const ticketContract = new Contract(event.ticketNftAddress, TICKET_NFT_ABI, catalogProvider);
      const insurancePoolContract = new Contract(
        event.insurancePool,
        INSURANCE_POOL_ABI,
        catalogProvider,
      );

      const [coverage, policy] = await Promise.all([
        ticketContract.coverageOf(BigInt(params.tokenId)),
        insurancePoolContract.currentPolicy().catch(() => [false, 0, 0, null]),
      ]);

      response.json({
        ticketEventId,
        tokenId: params.tokenId,
        supported: true,
        insured: Boolean(coverage[0]),
        claimed: Boolean(coverage[1]),
        claimable: Boolean(coverage[2]),
        payoutBps: Number(coverage[3] ?? 0),
        weatherRoundId: String(coverage[4] ?? 0),
        premiumPaidWei: String(coverage[5] ?? 0),
        payoutAmountWei: String(coverage[6] ?? 0),
        policyActive: Boolean(policy[0] ?? false),
        reportHash: policy[3] ? String(policy[3]) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/events/stream", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    metrics.incrementSseClients();

    const streamQuery = eventQuerySchema.safeParse(request.query);
    const requestedTicketEventId = streamQuery.success ? streamQuery.data.eventId : undefined;

    const send = (event: ChainEventPayload) => {
      if (requestedTicketEventId && event.ticketEventId !== requestedTicketEventId) {
        return;
      }
      metrics.recordSseEvent();
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    metrics.recordSseEvent();
    response.write(`data: ${JSON.stringify({ type: "hello", ts: Date.now() })}\n\n`);
    indexer.on("event", send);

    const keepAlive = setInterval(() => {
      response.write(`: keepalive ${Date.now()}\n\n`);
    }, 15_000);

    request.on("close", () => {
      clearInterval(keepAlive);
      indexer.off("event", send);
      metrics.decrementSseClients();
      response.end();
    });
  });

  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    const message = normalizeError(error);
    const requestId = response.getHeader("x-request-id");
    logger.error(
      {
        requestId,
        method: request.method,
        path: request.path,
        error: message,
      },
      "Request failed.",
    );

    response.status(400).json({
      error: message,
      requestId,
    });
  });

  return app;
}
