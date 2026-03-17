export const TICKET_NFT_ABI = [
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function PAUSER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function name() view returns (string)",
  "function primaryPrice() view returns (uint256)",
  "function insurancePremium() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function maxPerWallet() view returns (uint256)",
  "function fanPassSupplyCap() view returns (uint256)",
  "function fanPassMinted() view returns (uint256)",
  "function ticketClassOf(uint256 tokenId) view returns (uint8)",
  "function paused() view returns (bool)",
  "function collectibleMode() view returns (bool)",
  "function baseUris() view returns (string baseTokenURI, string collectibleBaseURI)",
  "function coverageOf(uint256 tokenId) view returns (bool insured, bool claimed, bool claimable, uint16 payoutBps, uint64 weatherRoundId, uint256 premiumPaid, uint256 payoutAmount)",
  "function nonces(uint256 tokenId) view returns (uint256)",
  "function isUsed(uint256 tokenId) view returns (bool)",
  "function attestationSigner() view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function mintPrimary() payable",
  "function mintStandard(bool insured) payable",
  "function mintFanPass(bytes attestation, bool insured, uint256 deadline) payable",
  "function approve(address spender, uint256 tokenId)",
  "function pause()",
  "function unpause()",
  "function setCollectibleMode(bool enabled)",
  "event PrimaryMinted(address indexed buyer, uint256 indexed tokenId, uint256 paidAmount)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event CollectibleModeUpdated(bool enabled)",
  "event BaseUrisUpdated(string baseTokenURI, string collectibleBaseURI)",
  "event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId)",
] as const;

export const MARKETPLACE_ABI = [
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function BUYBACK_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function list(uint256 tokenId, uint256 price)",
  "function listWithPermit(uint256 tokenId, uint256 price, uint256 deadline, bytes signature)",
  "function cancel(uint256 tokenId)",
  "function buy(uint256 tokenId) payable",
  "function organizerBuyback(uint256 tokenId) payable",
  "function getListing(uint256 tokenId) view returns (tuple(address seller, uint256 price))",
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event Cancelled(uint256 indexed tokenId, address indexed actor)",
  "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 feeAmount)",
] as const;

export const CHECK_IN_REGISTRY_ABI = [
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function SCANNER_ADMIN_ROLE() view returns (bytes32)",
  "function SCANNER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function isUsed(uint256 tokenId) view returns (bool)",
  "function markUsed(uint256 tokenId)",
  "function checkInAndTransform(uint256 tokenId, address receiver) returns (uint256 collectibleId)",
  "function grantScanner(address account)",
  "function revokeScanner(address account)",
  "event TicketMarkedUsed(uint256 indexed tokenId, address indexed scanner)",
  "event TicketCheckedInAndTransformed(uint256 indexed tokenId, uint256 indexed collectibleId, address indexed receiver, address scanner)",
  "event ScannerGranted(address indexed account)",
  "event ScannerRevoked(address indexed account)",
] as const;

export const FAN_FUEL_BANK_ABI = [
  "function balanceOf(address fan) view returns (uint256)",
] as const;

export const PERK_MANAGER_ABI = [
  "function perkOf(bytes32 perkId) view returns (tuple(bytes32 artistKey, uint256 minScore, uint256 minAttendances, uint256 fuelCost, bool active, string metadataURI))",
  "function canAccess(address fan, bytes32 perkId) view returns (bool)",
  "function redeemPerk(bytes32 perkId)",
  "event PerkConfigured(bytes32 indexed perkId, bytes32 indexed artistKey, uint256 minScore, uint256 minAttendances, uint256 fuelCost, bool active)",
  "event PerkRedeemed(bytes32 indexed perkId, address indexed fan, uint256 fuelCost)",
] as const;

export const COLLECTIBLE_NFT_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 collectibleId) view returns (address)",
  "function tokenURI(uint256 collectibleId) view returns (string)",
  "function levelOf(uint256 collectibleId) view returns (uint256)",
  "function collectibleInfo(uint256 collectibleId) view returns (tuple(uint256 sourceTicketId, address originFan, uint8 sourceTicketClass))",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
] as const;

export const MERCH_STORE_ABI = [
  "function fanFuelBank() view returns (address)",
  "function merchTwinNFT() view returns (address)",
  "function getSku(string skuId) view returns (tuple(string skuId, uint256 price, uint256 stock, bool active))",
  "function redeem(string skuId) returns (uint256 merchTwinId)",
  "event SkuConfigured(bytes32 indexed skuKey, string indexed skuId, uint256 price, uint256 stock, bool active)",
  "event Redeemed(bytes32 indexed skuKey, string indexed skuId, address indexed fan, uint256 merchTwinId, uint256 fuelCost)",
] as const;

export const MERCH_TWIN_NFT_ABI = [
  "function ownerOf(uint256 twinId) view returns (address)",
  "function tokenURI(uint256 twinId) view returns (string)",
  "function redemptionInfo(uint256 twinId) view returns (tuple(string skuId, address redeemer, uint256 fuelCost))",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
] as const;

export const INSURANCE_POOL_ABI = [
  "function currentPolicy() view returns (bool active, uint16 payoutBps, uint64 roundId, bytes32 reportHash)",
  "function claim(uint256 tokenId) returns (uint256 payoutAmount)",
] as const;

export const CHAIN_TICKET_FACTORY_ABI = [
  "function totalEvents() view returns (uint256)",
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,uint256 primaryPrice,uint256 maxSupply,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,uint256 deploymentBlock,uint256 registeredAt))",
] as const;

export const CHAIN_TICKET_FACTORY_V2_ABI = [
  "function totalEvents() view returns (uint256)",
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
  "function getEventById(string eventId) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
] as const;
