import type { ChainTicketEvent, TxResponseLike } from "../../types/chainticket";

export interface BaseLogEvent {
  tokenId: bigint;
  blockNumber: number;
  logIndex: number;
  txHash: string;
}

export interface TransferEvent extends BaseLogEvent {
  from: string;
  to: string;
}

export interface ListedEvent extends BaseLogEvent {
  seller: string;
  price: bigint;
}

export interface CancelledEvent extends BaseLogEvent {
  actor: string;
}

export interface SoldEvent extends BaseLogEvent {
  seller: string;
  buyer: string;
  price: bigint;
  feeAmount: bigint;
}

export interface UsedEvent extends BaseLogEvent {
  scanner: string;
}

export interface CollectibleModeEvent {
  enabled: boolean;
  blockNumber: number;
  logIndex: number;
  txHash: string;
}

export interface MerchSkuValue {
  skuId: string;
  price: bigint;
  stock: bigint;
  active: boolean;
}

export interface PerkValue {
  artistKey: string;
  minScore: bigint;
  minAttendances: bigint;
  fuelCost: bigint;
  active: boolean;
  metadataURI: string;
}

export interface ListingValue {
  seller: string;
  price: bigint;
}

export interface TicketBindings {
  hasRole?: (role: string, account: string) => Promise<boolean>;
  primaryPrice: () => Promise<bigint>;
  insurancePremium?: () => Promise<bigint>;
  maxSupply: () => Promise<bigint>;
  totalMinted: () => Promise<bigint>;
  maxPerWallet: () => Promise<bigint>;
  fanPassSupplyCap?: () => Promise<bigint>;
  fanPassMinted?: () => Promise<bigint>;
  ticketClassOf?: (tokenId: bigint) => Promise<number>;
  paused: () => Promise<boolean>;
  collectibleMode: () => Promise<boolean>;
  baseUris?: () => Promise<{ baseTokenURI: string; collectibleBaseURI: string }>;
  coverageOf?: (tokenId: bigint) => Promise<{
    insured: boolean;
    claimed: boolean;
    claimable: boolean;
    payoutBps: number;
    weatherRoundId: bigint;
    premiumPaid: bigint;
    payoutAmount: bigint;
  }>;
  isUsed: (tokenId: bigint) => Promise<boolean>;
  tokenURI: (tokenId: bigint) => Promise<string>;
  ownerOf: (tokenId: bigint) => Promise<string>;
  mintPrimary: (value: bigint) => Promise<TxResponseLike>;
  mintStandard?: (insured: boolean, value: bigint) => Promise<TxResponseLike>;
  mintFanPass?: (
    signature: string,
    insured: boolean,
    deadline: bigint,
    value: bigint,
  ) => Promise<TxResponseLike>;
  approve: (spender: string, tokenId: bigint) => Promise<TxResponseLike>;
  pause?: () => Promise<TxResponseLike>;
  unpause?: () => Promise<TxResponseLike>;
  setCollectibleMode?: (enabled: boolean) => Promise<TxResponseLike>;
  queryTransferEvents: (owner: string, fromBlock: number) => Promise<TransferEvent[]>;
  balanceOf?: (owner: string) => Promise<bigint>;
  getApproved?: (tokenId: bigint) => Promise<string>;
  isApprovedForAll?: (owner: string, operator: string) => Promise<boolean>;
  queryTransferEventsByToken?: (tokenId: bigint, fromBlock: number) => Promise<TransferEvent[]>;
  queryCollectibleModeEvents?: (fromBlock: number) => Promise<CollectibleModeEvent[]>;
  simulateMint?: (value: bigint) => Promise<void>;
  estimateMintGas?: (value: bigint) => Promise<bigint>;
  simulateMintStandard?: (insured: boolean, value: bigint) => Promise<void>;
  estimateMintStandardGas?: (insured: boolean, value: bigint) => Promise<bigint>;
  simulateMintFanPass?: (
    signature: string,
    insured: boolean,
    deadline: bigint,
    value: bigint,
  ) => Promise<void>;
  estimateMintFanPassGas?: (
    signature: string,
    insured: boolean,
    deadline: bigint,
    value: bigint,
  ) => Promise<bigint>;
  simulateApprove?: (spender: string, tokenId: bigint) => Promise<void>;
  estimateApproveGas?: (spender: string, tokenId: bigint) => Promise<bigint>;
}

export interface InsurancePoolBindings {
  claim?: (tokenId: bigint) => Promise<TxResponseLike>;
  simulateClaim?: (tokenId: bigint) => Promise<void>;
  estimateClaimGas?: (tokenId: bigint) => Promise<bigint>;
}

export interface FanFuelBankBindings {
  balanceOf?: (fan: string) => Promise<bigint>;
}

export interface PerkManagerBindings {
  perkOf?: (perkId: string) => Promise<PerkValue>;
  canAccess?: (fan: string, perkId: string) => Promise<boolean>;
  redeemPerk?: (perkId: string) => Promise<TxResponseLike>;
  simulateRedeemPerk?: (perkId: string) => Promise<void>;
  estimateRedeemPerkGas?: (perkId: string) => Promise<bigint>;
}

export interface MerchStoreBindings {
  getSku?: (skuId: string) => Promise<MerchSkuValue>;
  redeem?: (skuId: string) => Promise<TxResponseLike>;
  simulateRedeem?: (skuId: string) => Promise<void>;
  estimateRedeemGas?: (skuId: string) => Promise<bigint>;
}

export interface MarketplaceBindings {
  hasRole?: (role: string, account: string) => Promise<boolean>;
  list: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  listWithPermit?: (
    tokenId: bigint,
    price: bigint,
  ) => Promise<TxResponseLike>;
  cancel: (tokenId: bigint) => Promise<TxResponseLike>;
  buy: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  organizerBuyback?: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  getListing: (tokenId: bigint) => Promise<ListingValue>;
  queryListedEvents: (fromBlock: number) => Promise<ListedEvent[]>;
  queryCancelledEvents?: (fromBlock: number) => Promise<CancelledEvent[]>;
  querySoldEvents?: (fromBlock: number) => Promise<SoldEvent[]>;
  simulateList?: (tokenId: bigint, price: bigint) => Promise<void>;
  simulateListWithPermit?: (tokenId: bigint, price: bigint) => Promise<void>;
  estimateListGas?: (tokenId: bigint, price: bigint) => Promise<bigint>;
  estimateListWithPermitGas?: (tokenId: bigint, price: bigint) => Promise<bigint>;
  simulateCancel?: (tokenId: bigint) => Promise<void>;
  estimateCancelGas?: (tokenId: bigint) => Promise<bigint>;
  simulateBuy?: (tokenId: bigint, price: bigint) => Promise<void>;
  estimateBuyGas?: (tokenId: bigint, price: bigint) => Promise<bigint>;
  simulateOrganizerBuyback?: (tokenId: bigint, price: bigint) => Promise<void>;
  estimateOrganizerBuybackGas?: (tokenId: bigint, price: bigint) => Promise<bigint>;
}

export interface CheckInBindings {
  hasRole?: (role: string, account: string) => Promise<boolean>;
  isUsed: (tokenId: bigint) => Promise<boolean>;
  markUsed?: (tokenId: bigint) => Promise<TxResponseLike>;
  checkInAndTransform?: (tokenId: bigint, receiver: string) => Promise<TxResponseLike>;
  grantScanner?: (account: string) => Promise<TxResponseLike>;
  revokeScanner?: (account: string) => Promise<TxResponseLike>;
  simulateMarkUsed?: (tokenId: bigint) => Promise<void>;
  estimateMarkUsedGas?: (tokenId: bigint) => Promise<bigint>;
  simulateCheckInAndTransform?: (tokenId: bigint, receiver: string) => Promise<void>;
  estimateCheckInAndTransformGas?: (tokenId: bigint, receiver: string) => Promise<bigint>;
  queryUsedEvents?: (tokenId: bigint, fromBlock: number) => Promise<UsedEvent[]>;
}

export interface ChainTicketBindings {
  ticket: TicketBindings;
  marketplace: MarketplaceBindings;
  checkInRegistry: CheckInBindings;
  fanFuelBank?: FanFuelBankBindings;
  perkManager?: PerkManagerBindings;
  merchStore?: MerchStoreBindings;
  insurancePool?: InsurancePoolBindings;
  getSignerAddress?: () => Promise<string>;
  hasSigner?: () => boolean;
  getBlockTimestamp?: (blockNumber: number) => Promise<number | null>;
  subscribeEvents?: (onEvent: (event: ChainTicketEvent) => void) => () => void;
}
