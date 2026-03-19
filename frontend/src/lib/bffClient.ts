import type {
  BackendHealthSnapshot,
  ChainTicketEvent,
  CollectibleView,
  FanProfile,
  FanPerkView,
  FanPassAttestation,
  OperationalActivity,
  OperationalRoleAssignment,
  OperationalSummary,
  EventDeployment,
  MarketStats,
  MerchRedemptionView,
  MerchSkuView,
  MarketplaceView,
  SystemState,
  TicketCoverage,
  TicketTimelineEntry,
  TicketView,
} from "../types/chainticket";

type ListingSort = "price_asc" | "price_desc" | "recent";

interface BffSystemPayload {
  version?: "v1" | "v2";
  primaryPriceWei: string;
  insurancePremiumWei?: string | null;
  maxSupply: string;
  totalMinted: string;
  maxPerWallet: string;
  fanPassSupplyCap?: string | null;
  fanPassMinted?: string | null;
  paused: boolean;
  collectibleMode: boolean;
  baseTokenURI?: string;
  collectibleBaseURI?: string;
}

interface BffListingPayload {
  tokenId: string;
  seller: string;
  priceWei: string;
  isActive: boolean;
}

interface BffMarketStatsPayload {
  listingCount: number;
  floorPriceWei: string | null;
  medianPriceWei: string | null;
  maxPriceWei: string | null;
  averagePriceWei: string | null;
  suggestedListPriceWei: string | null;
}

interface BffTicketPayload {
  tokenId: string;
  owner: string;
  used: boolean;
  tokenURI: string;
  listed: boolean;
  listingPriceWei: string | null;
}

interface BffTimelineEntryPayload {
  id: string;
  tokenId: string;
  kind: TicketTimelineEntry["kind"];
  blockNumber: number;
  txHash: string;
  timestamp: number | null;
  description: string;
  from?: string;
  to?: string;
  seller?: string;
  buyer?: string;
  scanner?: string;
  priceWei?: string;
  feeAmountWei?: string;
}

interface BffEventDeploymentPayload {
  ticketEventId: string;
  name: string;
  symbol: string;
  version?: "v1" | "v2";
  artistId?: string;
  seriesId?: string;
  primaryPriceWei: string;
  maxSupply: string;
  fanPassAllocationBps?: string;
  artistRoyaltyBps?: string;
  treasury: string;
  admin: string;
  ticketNftAddress: string;
  marketplaceAddress: string;
  checkInRegistryAddress: string;
  collectibleContract?: string;
  fanScoreRegistry?: string;
  fanFuelBank?: string;
  insurancePool?: string;
  oracleAdapter?: string;
  merchStore?: string;
  perkManager?: string;
  deploymentBlock: number;
  registeredAt: number;
  isDemoInspired?: boolean;
  demoDisclaimer?: string;
  source?: "ticketmaster";
  sourceEventId?: string;
  sourceUrl?: string | null;
  startsAt?: number | null;
  venueName?: string | null;
  city?: string | null;
  countryCode?: string | null;
  imageUrl?: string | null;
  category?: string | null;
}

interface BffOperationalRolePayload {
  ticketEventId: string;
  contractScope: OperationalRoleAssignment["contractScope"];
  roleId: string;
  account: string;
  grantedBy: string | null;
  isActive: boolean;
  updatedBlock: number;
  updatedTxHash: string;
}

interface BffOperationalActivityPayload {
  id: string;
  ticketEventId: string;
  contractScope: OperationalActivity["contractScope"];
  type: OperationalActivity["type"];
  roleId: string | null;
  account: string | null;
  actor: string | null;
  blockNumber: number;
  txHash: string;
  timestamp: number | null;
}

interface BffHealthPayload {
  ok: boolean;
  degraded: boolean;
  checkedAt: number;
  indexedBlock: number;
  latestBlock: number | null;
  lag: number | null;
  stalenessMs: number | null;
  rpcHealthy: boolean;
  readModelReady: boolean;
  configuredDeploymentBlock: number;
  alerts: Array<{
    code: string;
    severity: "warning" | "critical";
    message: string;
  }>;
}

interface BffFanProfilePayload {
  ticketEventId: string;
  address: string;
  version: "v1" | "v2";
  artistId?: string | null;
  seriesId?: string | null;
  reputationScore: string;
  tierLevel: number;
  tierLabel: FanProfile["tierLabel"];
  fuelBalance: string;
  artistAttendanceCount: string;
  currentTicketCount: number;
  listedTicketCount: number;
  collectibleCount: string;
}

interface BffTicketCoveragePayload {
  ticketEventId: string;
  tokenId: string;
  supported: boolean;
  insured: boolean;
  claimed: boolean;
  claimable: boolean;
  payoutBps: number;
  weatherRoundId: string;
  premiumPaidWei: string;
  payoutAmountWei: string;
  policyActive: boolean;
  reportHash: string | null;
}

interface BffFanPassAttestationPayload {
  ticketEventId: string;
  address: string;
  signer: string;
  deadline: string;
  signature: string;
}

interface BffCollectiblePayload {
  collectibleId: string;
  owner: string;
  originFan: string;
  sourceTicketId: string;
  sourceTicketClass: number;
  level: string;
  tokenURI: string;
}

interface BffFanPerkPayload {
  perkId: string;
  artistKey: string;
  minScore: string;
  minAttendances: string;
  fuelCost: string;
  active: boolean;
  metadataURI: string;
  unlocked: boolean;
  redeemedCount: number;
  lastRedeemedTxHash: string | null;
}

interface BffMerchSkuPayload {
  skuId: string;
  price: string;
  stock: string;
  active: boolean;
}

interface BffMerchRedemptionPayload {
  skuId: string;
  twinId: string;
  fan: string;
  fuelCost: string;
  txHash: string;
  blockNumber: number;
}

function toBigInt(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined) {
    return null;
  }
  return BigInt(value);
}

function parseSystem(payload: BffSystemPayload): SystemState {
  return {
    version: payload.version ?? "v1",
    primaryPrice: BigInt(payload.primaryPriceWei),
    insurancePremium: toBigInt(payload.insurancePremiumWei) ?? undefined,
    maxSupply: BigInt(payload.maxSupply),
    totalMinted: BigInt(payload.totalMinted),
    maxPerWallet: BigInt(payload.maxPerWallet),
    fanPassSupplyCap: toBigInt(payload.fanPassSupplyCap) ?? undefined,
    fanPassMinted: toBigInt(payload.fanPassMinted) ?? undefined,
    paused: payload.paused,
    collectibleMode: payload.collectibleMode,
    baseTokenURI: payload.baseTokenURI ?? "",
    collectibleBaseURI: payload.collectibleBaseURI ?? "",
  };
}

function parseListings(payload: BffListingPayload[]): MarketplaceView[] {
  return payload.map((item) => ({
    tokenId: BigInt(item.tokenId),
    seller: item.seller,
    price: BigInt(item.priceWei),
    isActive: item.isActive,
  }));
}

function parseStats(payload: BffMarketStatsPayload): MarketStats {
  return {
    listingCount: payload.listingCount,
    floorPrice: toBigInt(payload.floorPriceWei),
    medianPrice: toBigInt(payload.medianPriceWei),
    maxPrice: toBigInt(payload.maxPriceWei),
    averagePrice: toBigInt(payload.averagePriceWei),
    suggestedListPrice: toBigInt(payload.suggestedListPriceWei),
  };
}

function parseTickets(payload: BffTicketPayload[]): TicketView[] {
  return payload.map((item) => ({
    tokenId: BigInt(item.tokenId),
    owner: item.owner,
    used: item.used,
    tokenURI: item.tokenURI,
    listed: item.listed,
    listingPrice: toBigInt(item.listingPriceWei),
  }));
}

function parseTimeline(payload: BffTimelineEntryPayload[]): TicketTimelineEntry[] {
  return payload.map((item) => ({
    id: item.id,
    tokenId: BigInt(item.tokenId),
    kind: item.kind,
    blockNumber: item.blockNumber,
    txHash: item.txHash,
    timestamp: item.timestamp,
    description: item.description,
    from: item.from,
    to: item.to,
    seller: item.seller,
    buyer: item.buyer,
    scanner: item.scanner,
    price: toBigInt(item.priceWei) ?? undefined,
    feeAmount: toBigInt(item.feeAmountWei) ?? undefined,
  }));
}

function parseEvents(payload: BffEventDeploymentPayload[]): EventDeployment[] {
  return payload.map((item) => ({
    ticketEventId: item.ticketEventId,
    name: item.name,
    symbol: item.symbol,
    version: item.version,
    artistId: item.artistId,
    seriesId: item.seriesId,
    primaryPriceWei: item.primaryPriceWei,
    maxSupply: item.maxSupply,
    fanPassAllocationBps: item.fanPassAllocationBps,
    artistRoyaltyBps: item.artistRoyaltyBps,
    treasury: item.treasury,
    admin: item.admin,
    ticketNftAddress: item.ticketNftAddress,
    marketplaceAddress: item.marketplaceAddress,
    checkInRegistryAddress: item.checkInRegistryAddress,
    collectibleContract: item.collectibleContract,
    fanScoreRegistry: item.fanScoreRegistry,
    fanFuelBank: item.fanFuelBank,
    insurancePool: item.insurancePool,
    oracleAdapter: item.oracleAdapter,
    merchStore: item.merchStore,
    perkManager: item.perkManager,
    deploymentBlock: item.deploymentBlock,
    registeredAt: item.registeredAt,
    isDemoInspired: item.isDemoInspired ?? false,
    demoDisclaimer: item.demoDisclaimer ?? undefined,
    source: item.source,
    sourceEventId: item.sourceEventId,
    sourceUrl: item.sourceUrl ?? null,
    startsAt: item.startsAt ?? null,
    venueName: item.venueName ?? null,
    city: item.city ?? null,
    countryCode: item.countryCode ?? null,
    imageUrl: item.imageUrl ?? null,
    category: item.category ?? null,
  }));
}

function parseOperationalSummary(payload: {
  ticketEventId: string;
  roles: BffOperationalRolePayload[];
  recentActivity: BffOperationalActivityPayload[];
}): OperationalSummary {
  return {
    ticketEventId: payload.ticketEventId,
    roles: payload.roles.map((role) => ({
      ticketEventId: role.ticketEventId,
      contractScope: role.contractScope,
      roleId: role.roleId,
      account: role.account,
      grantedBy: role.grantedBy,
      isActive: role.isActive,
      updatedBlock: role.updatedBlock,
      updatedTxHash: role.updatedTxHash,
    })),
    recentActivity: payload.recentActivity.map((activity) => ({
      id: activity.id,
      ticketEventId: activity.ticketEventId,
      contractScope: activity.contractScope,
      type: activity.type,
      roleId: activity.roleId ?? undefined,
      account: activity.account ?? undefined,
      actor: activity.actor ?? undefined,
      blockNumber: activity.blockNumber,
      txHash: activity.txHash,
      timestamp: activity.timestamp,
    })),
  };
}

function parseHealth(payload: BffHealthPayload): BackendHealthSnapshot {
  return {
    ok: payload.ok,
    degraded: payload.degraded,
    checkedAt: payload.checkedAt,
    indexedBlock: payload.indexedBlock,
    latestBlock: payload.latestBlock,
    lag: payload.lag,
    stalenessMs: payload.stalenessMs,
    rpcHealthy: payload.rpcHealthy,
    readModelReady: payload.readModelReady,
    configuredDeploymentBlock: payload.configuredDeploymentBlock,
    alerts: payload.alerts.map((alert) => ({
      code: alert.code,
      severity: alert.severity,
      message: alert.message,
    })),
  };
}

function parseFanProfile(payload: BffFanProfilePayload): FanProfile {
  return {
    ticketEventId: payload.ticketEventId,
    address: payload.address,
    version: payload.version,
    artistId: payload.artistId ?? null,
    seriesId: payload.seriesId ?? null,
    reputationScore: BigInt(payload.reputationScore),
    tierLevel: payload.tierLevel,
    tierLabel: payload.tierLabel,
    fuelBalance: BigInt(payload.fuelBalance),
    artistAttendanceCount: BigInt(payload.artistAttendanceCount),
    currentTicketCount: payload.currentTicketCount,
    listedTicketCount: payload.listedTicketCount,
    collectibleCount: BigInt(payload.collectibleCount),
  };
}

function parseCoverage(payload: BffTicketCoveragePayload): TicketCoverage {
  return {
    ticketEventId: payload.ticketEventId,
    tokenId: BigInt(payload.tokenId),
    supported: payload.supported,
    insured: payload.insured,
    claimed: payload.claimed,
    claimable: payload.claimable,
    payoutBps: payload.payoutBps,
    weatherRoundId: BigInt(payload.weatherRoundId),
    premiumPaid: BigInt(payload.premiumPaidWei),
    payoutAmount: BigInt(payload.payoutAmountWei),
    policyActive: payload.policyActive,
    reportHash: payload.reportHash,
  };
}

function parseFanPassAttestation(payload: BffFanPassAttestationPayload): FanPassAttestation {
  return {
    ticketEventId: payload.ticketEventId,
    address: payload.address,
    signer: payload.signer,
    deadline: BigInt(payload.deadline),
    signature: payload.signature,
  };
}

function parseCollectibles(payload: BffCollectiblePayload[]): CollectibleView[] {
  return payload.map((item) => ({
    collectibleId: BigInt(item.collectibleId),
    owner: item.owner,
    originFan: item.originFan,
    sourceTicketId: BigInt(item.sourceTicketId),
    sourceTicketClass: item.sourceTicketClass,
    level: BigInt(item.level),
    tokenURI: item.tokenURI,
  }));
}

function parseFanPerks(payload: BffFanPerkPayload[]): FanPerkView[] {
  return payload.map((item) => ({
    perkId: item.perkId,
    artistKey: item.artistKey,
    minScore: BigInt(item.minScore),
    minAttendances: BigInt(item.minAttendances),
    fuelCost: BigInt(item.fuelCost),
    active: item.active,
    metadataURI: item.metadataURI,
    unlocked: item.unlocked,
    redeemedCount: item.redeemedCount,
    lastRedeemedTxHash: item.lastRedeemedTxHash,
  }));
}

function parseMerchCatalog(payload: BffMerchSkuPayload[]): MerchSkuView[] {
  return payload.map((item) => ({
    skuId: item.skuId,
    price: BigInt(item.price),
    stock: BigInt(item.stock),
    active: item.active,
  }));
}

function parseMerchRedemptions(payload: BffMerchRedemptionPayload[]): MerchRedemptionView[] {
  return payload.map((item) => ({
    skuId: item.skuId,
    twinId: BigInt(item.twinId),
    fan: item.fan,
    fuelCost: BigInt(item.fuelCost),
    txHash: item.txHash,
    blockNumber: item.blockNumber,
  }));
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    query.set(key, String(value));
  }

  return query.size > 0 ? `?${query.toString()}` : "";
}

function parseStreamEvent(payload: unknown): ChainTicketEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as {
    type?: ChainTicketEvent["type"];
    ticketEventId?: string;
    tokenId?: string;
    txHash?: string;
    blockNumber?: number;
  };

  if (!value.type) {
    return null;
  }

  return {
    type: value.type,
    ticketEventId: value.ticketEventId,
    tokenId: value.tokenId ? BigInt(value.tokenId) : undefined,
    txHash: value.txHash,
    blockNumber: value.blockNumber,
  };
}

export class BffClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetchJson<T>(
    path: string,
    options: {
      method?: "GET" | "POST";
      body?: unknown;
      bearerToken?: string | null;
      timeoutMs?: number;
    } = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 6500;
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
      if (options.bearerToken) {
        headers.Authorization = `Bearer ${options.bearerToken}`;
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        cache: "no-store",
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`BFF request failed (${response.status}) on ${path}`);
      }

      return (await response.json()) as T;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async health(): Promise<BackendHealthSnapshot> {
    const payload = await this.fetchJson<BffHealthPayload>("/v1/health");
    return parseHealth(payload);
  }

  async listEvents(): Promise<{ items: EventDeployment[]; defaultEventId: string }> {
    const payload = await this.fetchJson<{
      items: BffEventDeploymentPayload[];
      defaultEventId: string;
    }>("/v1/events");

    return {
      items: parseEvents(payload.items),
      defaultEventId: payload.defaultEventId,
    };
  }

  async getSystemState(eventId?: string): Promise<SystemState> {
    const payload = await this.fetchJson<BffSystemPayload>(
      `/v1/system${buildQuery({ eventId })}`,
    );
    return parseSystem(payload);
  }

  async getListings(options: {
    eventId?: string;
    sort?: ListingSort;
    limit?: number;
    offset?: number;
  } = {}): Promise<MarketplaceView[]> {
    const suffix = buildQuery({
      eventId: options.eventId,
      sort: options.sort,
      limit: options.limit,
      offset: options.offset,
    });
    const payload = await this.fetchJson<{ items: BffListingPayload[] }>(`/v1/listings${suffix}`);
    return parseListings(payload.items);
  }

  async getMarketStats(eventId?: string): Promise<MarketStats> {
    const payload = await this.fetchJson<BffMarketStatsPayload>(
      `/v1/market/stats${buildQuery({ eventId })}`,
    );
    return parseStats(payload);
  }

  async getUserTickets(address: string, eventId?: string): Promise<TicketView[]> {
    const payload = await this.fetchJson<{ items: BffTicketPayload[] }>(
      `/v1/users/${address}/tickets${buildQuery({ eventId })}`,
    );
    return parseTickets(payload.items);
  }

  async getTicketTimeline(tokenId: bigint, eventId?: string): Promise<TicketTimelineEntry[]> {
    const payload = await this.fetchJson<{ items: BffTimelineEntryPayload[] }>(
      `/v1/tickets/${tokenId.toString()}/timeline${buildQuery({ eventId })}`,
    );
    return parseTimeline(payload.items);
  }

  async getOperationalSummary(eventId?: string): Promise<OperationalSummary> {
    const payload = await this.fetchJson<{
      ticketEventId: string;
      roles: BffOperationalRolePayload[];
      recentActivity: BffOperationalActivityPayload[];
    }>(`/v1/ops/summary${buildQuery({ eventId })}`);
    return parseOperationalSummary(payload);
  }

  async getFanProfile(address: string, eventId?: string): Promise<FanProfile> {
    const payload = await this.fetchJson<BffFanProfilePayload>(
      `/v1/fans/${address}/profile${buildQuery({ eventId })}`,
    );
    return parseFanProfile(payload);
  }

  async getFanCollectibles(address: string, eventId?: string): Promise<CollectibleView[]> {
    const payload = await this.fetchJson<{ items: BffCollectiblePayload[] }>(
      `/v1/fans/${address}/collectibles${buildQuery({ eventId })}`,
    );
    return parseCollectibles(payload.items);
  }

  async getFanPerks(address: string, eventId?: string): Promise<FanPerkView[]> {
    const payload = await this.fetchJson<{ items: BffFanPerkPayload[] }>(
      `/v1/fans/${address}/perks${buildQuery({ eventId })}`,
    );
    return parseFanPerks(payload.items);
  }

  async getMerchCatalog(eventId?: string): Promise<MerchSkuView[]> {
    const payload = await this.fetchJson<{ items: BffMerchSkuPayload[] }>(
      `/v1/merch/catalog${buildQuery({ eventId })}`,
    );
    return parseMerchCatalog(payload.items);
  }

  async getFanMerchRedemptions(address: string, eventId?: string): Promise<MerchRedemptionView[]> {
    const payload = await this.fetchJson<{ items: BffMerchRedemptionPayload[] }>(
      `/v1/fans/${address}/merch-redemptions${buildQuery({ eventId })}`,
    );
    return parseMerchRedemptions(payload.items);
  }

  async getTicketCoverage(tokenId: bigint, eventId?: string): Promise<TicketCoverage> {
    const payload = await this.fetchJson<BffTicketCoveragePayload>(
      `/v1/tickets/${tokenId.toString()}/coverage${buildQuery({ eventId })}`,
    );
    return parseCoverage(payload);
  }

  async getFanPassAttestation(address: string, eventId?: string): Promise<FanPassAttestation> {
    const payload = await this.fetchJson<BffFanPassAttestationPayload>(
      `/v1/fans/${address}/fanpass-attestation${buildQuery({ eventId })}`,
    );
    return parseFanPassAttestation(payload);
  }

  watchEvents(
    onEvent: (event: ChainTicketEvent) => void,
    onError?: (error: unknown) => void,
    eventId?: string,
  ): () => void {
    const stream = new EventSource(
      `${this.baseUrl}/v1/events/stream${buildQuery({ eventId })}`,
    );

    const messageHandler = (message: MessageEvent<string>) => {
      try {
        const parsed = parseStreamEvent(JSON.parse(message.data));
        if (parsed) {
          onEvent(parsed);
        }
      } catch (error) {
        onError?.(error);
      }
    };

    const errorHandler = (error: unknown) => {
      onError?.(error);
    };

    stream.addEventListener("message", messageHandler as EventListener);
    stream.addEventListener("error", errorHandler as EventListener);

    return () => {
      stream.removeEventListener("message", messageHandler as EventListener);
      stream.removeEventListener("error", errorHandler as EventListener);
      stream.close();
    };
  }
}

export function createBffClient(baseUrl: string | null): BffClient | null {
  if (!baseUrl) {
    return null;
  }
  return new BffClient(baseUrl);
}
