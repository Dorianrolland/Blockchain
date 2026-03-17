export interface ContractConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerTxBaseUrl: string;
  deploymentBlock: number;
  version?: "v1" | "v2";
  eventId?: string;
  eventName?: string;
  ticketNftAddress: string;
  marketplaceAddress: string;
  checkInRegistryAddress: string;
  fanFuelBankAddress?: string;
  merchStoreAddress?: string;
  insurancePoolAddress?: string;
  perkManagerAddress?: string;
}

export interface EventDeployment {
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

export type ContractScope = "ticket" | "checkin_registry";

export type OperationalActivityType =
  | "paused"
  | "unpaused"
  | "role_granted"
  | "role_revoked";

export interface OperationalRoleAssignment {
  ticketEventId: string;
  contractScope: ContractScope;
  roleId: string;
  account: string;
  grantedBy: string | null;
  isActive: boolean;
  updatedBlock: number;
  updatedTxHash: string;
}

export interface OperationalActivity {
  id: string;
  ticketEventId: string;
  contractScope: ContractScope;
  type: OperationalActivityType;
  roleId?: string;
  account?: string;
  actor?: string;
  blockNumber: number;
  txHash: string;
  timestamp: number | null;
}

export interface OperationalSummary {
  ticketEventId: string;
  roles: OperationalRoleAssignment[];
  recentActivity: OperationalActivity[];
}

export type ChainEnv = "amoy" | "mainnet-ready";

export interface RuntimeConfig {
  apiBaseUrl: string | null;
  chainEnv: ChainEnv;
  featureFlags: string[];
  defaultEventId: string;
  factoryAddress: string | null;
  governanceTimelockAddress: string | null;
  governanceMinDelaySeconds: number;
  governancePortalUrl: string | null;
  embeddedWalletEnabled: boolean;
  embeddedWalletLabel: string;
}

export type WorkspaceKey = "explore" | "marketplace" | "tickets" | "organizer";

export type OrganizerSubrouteKey = "overview" | "scanner" | "sales" | "settings";

export type EventDetailTabKey = "overview" | "rules" | "resale" | "perks" | "proof";

export interface WorkspaceConfig {
  key: WorkspaceKey;
  path: string;
  accent: "aurora" | "cobalt" | "mint" | "ember";
}

export type BackendHealthSeverity = "warning" | "critical";

export interface BackendHealthAlert {
  code: string;
  severity: BackendHealthSeverity;
  message: string;
}

export interface BackendHealthSnapshot {
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
  alerts: BackendHealthAlert[];
}

export type UiMode = "guide" | "advanced";

export interface RouteGuideMeta {
  routeKey: "buy" | "resale" | "tickets" | "advanced";
  title: string;
  currentStep: string;
  recommendedAction: string;
  actionLabel: string;
  actionTo: string;
}

export interface WalletProviderInfo {
  id: string;
  name: string;
  kind: "injected" | "embedded";
  icon?: string;
  rdns?: string;
  isMetaMask: boolean;
  provider?: EthereumProvider;
  description?: string;
  sponsoredActions?: string[];
}

export interface EmbeddedWalletCodeRequest {
  enabled: boolean;
  email: string;
  walletAddress: string;
  expiresAt: number;
  codeSent: boolean;
  devCode: string | null;
  provider: {
    id: string;
    label: string;
    sponsoredActions: string[];
  };
}

export interface EmbeddedWalletSession {
  email: string;
  walletAddress: string;
  expiresAt: number;
  sessionToken: string;
  providerId: string;
  providerLabel: string;
  sponsoredActions: string[];
}

export type SponsoredWalletActionRequest =
  | { eventId?: string; action: "mint_standard"; insured: boolean }
  | { eventId?: string; action: "mint_fanpass"; insured: boolean }
  | { eventId?: string; action: "claim_insurance"; tokenId: bigint }
  | { eventId?: string; action: "redeem_perk"; perkId: string }
  | { eventId?: string; action: "redeem_merch"; skuId: string };

export interface SponsoredWalletActionResponse {
  ok: boolean;
  ticketEventId: string;
  action: SponsoredWalletActionRequest["action"];
  txHash: string;
  walletAddress: string;
  sponsoredValue: bigint;
}

export interface TicketView {
  tokenId: bigint;
  owner: string;
  used: boolean;
  tokenURI: string;
  listed: boolean;
  listingPrice: bigint | null;
}

export interface TicketAttribute {
  traitType: string;
  value: string;
  displayType?: string;
}

export interface TicketMetadata {
  tokenUri: string;
  name: string | null;
  description: string | null;
  image: string | null;
  animationUrl: string | null;
  externalUrl: string | null;
  backgroundColor: string | null;
  attributes: TicketAttribute[];
}

export interface TicketMediaAsset {
  kind: "image" | "animation" | "fallback";
  src: string | null;
  posterSrc: string | null;
  alt: string;
}

export interface TicketPreviewState {
  liveTokenUri: string | null;
  collectibleTokenUri: string | null;
  activeTokenUri: string;
  liveMetadata: TicketMetadata | null;
  collectibleMetadata: TicketMetadata | null;
  activeMetadata: TicketMetadata | null;
  liveMedia: TicketMediaAsset | null;
  collectibleMedia: TicketMediaAsset | null;
  activeMedia: TicketMediaAsset;
  activeView: "live" | "collectible";
  liveQrValue: string | null;
  collectibleQrValue: string | null;
  isLoading: boolean;
  errorMessage: string | null;
}

export interface MarketplaceView {
  tokenId: bigint;
  seller: string;
  price: bigint;
  isActive: boolean;
}

export interface ListingHealth {
  tokenId: bigint;
  isActive: boolean;
  seller: string | null;
  price: bigint | null;
  used: boolean;
  sellerMatchesExpectation: boolean;
  priceMatchesExpectation: boolean;
  reason?: string;
}

export interface FanPassAttestation {
  ticketEventId: string;
  address: string;
  signer: string;
  deadline: bigint;
  signature: string;
}

export interface CollectibleView {
  collectibleId: bigint;
  owner: string;
  originFan: string;
  sourceTicketId: bigint;
  sourceTicketClass: number;
  level: bigint;
  tokenURI: string;
}

export interface MerchSkuView {
  skuId: string;
  price: bigint;
  stock: bigint;
  active: boolean;
}

export interface MerchRedemptionView {
  skuId: string;
  twinId: bigint;
  fan: string;
  fuelCost: bigint;
  txHash: string;
  blockNumber: number;
}

export interface FanPerkView {
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

export type PreflightAction =
  | { type: "mint" }
  | { type: "mint_standard"; insured: boolean }
  | { type: "mint_fanpass"; insured: boolean; deadline: bigint; signature: string }
  | { type: "checkin_mark_used"; tokenId: bigint }
  | { type: "checkin_transform"; tokenId: bigint }
  | { type: "claim_insurance"; tokenId: bigint }
  | { type: "redeem_perk"; perkId: string }
  | { type: "redeem_merch"; skuId: string }
  | { type: "approve"; tokenId: bigint }
  | { type: "list"; tokenId: bigint; price: bigint }
  | { type: "list_with_permit"; tokenId: bigint; price: bigint }
  | { type: "cancel"; tokenId: bigint; expectedSeller?: string }
  | { type: "buy"; tokenId: bigint; price: bigint; expectedSeller?: string }
  | { type: "organizer_buyback"; tokenId: bigint };

export interface PreflightResult {
  action: PreflightAction["type"];
  ok: boolean;
  blockers: string[];
  warnings: string[];
  gasEstimate: bigint | null;
  simulationPassed: boolean;
  listingHealth: ListingHealth | null;
  walletCapRemaining: bigint | null;
}

export type TicketTimelineKind =
  | "mint"
  | "transfer"
  | "listed"
  | "cancelled"
  | "sold"
  | "used"
  | "collectible";

export interface TicketTimelineEntry {
  id: string;
  tokenId: bigint;
  kind: TicketTimelineKind;
  blockNumber: number;
  txHash: string;
  timestamp: number | null;
  description: string;
  from?: string;
  to?: string;
  seller?: string;
  buyer?: string;
  scanner?: string;
  price?: bigint;
  feeAmount?: bigint;
}

export interface MarketStats {
  listingCount: number;
  floorPrice: bigint | null;
  medianPrice: bigint | null;
  maxPrice: bigint | null;
  averagePrice: bigint | null;
  suggestedListPrice: bigint | null;
}

export interface UserRoles {
  isAdmin: boolean;
  isBuybackOperator: boolean;
  isScannerAdmin: boolean;
  isPauser: boolean;
  isScanner: boolean;
}

export interface ChainTicketEvent {
  type: "listed" | "cancelled" | "sold" | "transfer" | "used" | "collectible_mode";
  ticketEventId?: string;
  tokenId?: bigint;
  txHash?: string;
  blockNumber?: number;
}

export type TxStatus = "idle" | "pending" | "success" | "error";

export interface TxState {
  status: TxStatus;
  label?: string;
  hash?: string;
  errorReason?: string;
  timestamp: number;
}

export interface SystemState {
  primaryPrice: bigint;
  maxSupply: bigint;
  totalMinted: bigint;
  maxPerWallet: bigint;
  paused: boolean;
  collectibleMode: boolean;
  version?: "v1" | "v2";
  insurancePremium?: bigint;
  fanPassSupplyCap?: bigint;
  fanPassMinted?: bigint;
  baseTokenURI?: string;
  collectibleBaseURI?: string;
}

export interface FanProfile {
  ticketEventId: string;
  address: string;
  version: "v1" | "v2";
  artistId?: string | null;
  seriesId?: string | null;
  reputationScore: bigint;
  tierLevel: number;
  tierLabel: "base" | "silver" | "gold" | "platinum";
  fuelBalance: bigint;
  artistAttendanceCount: bigint;
  currentTicketCount: number;
  listedTicketCount: number;
  collectibleCount: bigint;
}

export interface TicketCoverage {
  ticketEventId: string;
  tokenId: bigint;
  supported: boolean;
  insured: boolean;
  claimed: boolean;
  claimable: boolean;
  payoutBps: number;
  weatherRoundId: bigint;
  premiumPaid: bigint;
  payoutAmount: bigint;
  policyActive: boolean;
  reportHash: string | null;
}

export interface TxResponseLike {
  hash: string;
  wait: () => Promise<unknown>;
}

export interface PendingPreview {
  label: string;
  description: string;
  details: string[];
  preflight: PreflightResult | null;
  action?: PreflightAction;
  run: (client: ChainTicketClient) => Promise<TxResponseLike>;
}

export interface ChainTicketClient {
  discoverWallets: () => Promise<WalletProviderInfo[]>;
  getSystemState: () => Promise<SystemState>;
  getMyTickets: (owner: string) => Promise<TicketView[]>;
  getListings: () => Promise<MarketplaceView[]>;
  getMarketStats: () => Promise<MarketStats>;
  getTicketTimeline: (tokenId: bigint) => Promise<TicketTimelineEntry[]>;
  preflightAction: (action: PreflightAction) => Promise<PreflightResult>;
  watchEvents: (onEvent: (event: ChainTicketEvent) => void) => () => void;
  mintPrimary: () => Promise<TxResponseLike>;
  mintStandardTicket?: (insured: boolean) => Promise<TxResponseLike>;
  mintFanPassTicket?: (attestation: FanPassAttestation, insured: boolean) => Promise<TxResponseLike>;
  approveTicket: (tokenId: bigint) => Promise<TxResponseLike>;
  listTicket: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  listTicketWithPermit?: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  cancelListing: (tokenId: bigint) => Promise<TxResponseLike>;
  buyTicket: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  organizerBuyback?: (tokenId: bigint) => Promise<TxResponseLike>;
  claimInsurance?: (tokenId: bigint) => Promise<TxResponseLike>;
  redeemPerk?: (perkId: string) => Promise<TxResponseLike>;
  redeemMerch?: (skuId: string) => Promise<TxResponseLike>;
  getUserRoles?: (address: string) => Promise<UserRoles>;
  markTicketUsed?: (tokenId: bigint) => Promise<TxResponseLike>;
  checkInToCollectible?: (tokenId: bigint) => Promise<TxResponseLike>;
  grantScannerRole?: (account: string) => Promise<TxResponseLike>;
  revokeScannerRole?: (account: string) => Promise<TxResponseLike>;
  pauseSystem?: () => Promise<TxResponseLike>;
  unpauseSystem?: () => Promise<TxResponseLike>;
  setCollectibleMode?: (enabled: boolean) => Promise<TxResponseLike>;
}
