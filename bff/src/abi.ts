export const TICKET_NFT_ABI = [
  "function name() view returns (string)",
  "function primaryPrice() view returns (uint256)",
  "function insurancePremium() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function maxPerWallet() view returns (uint256)",
  "function fanPassSupplyCap() view returns (uint256)",
  "function fanPassMinted() view returns (uint256)",
  "function attestationSigner() view returns (address)",
  "function paused() view returns (bool)",
  "function collectibleMode() view returns (bool)",
  "function baseUris() view returns (string baseTokenURI, string collectibleBaseURI)",
  "function coverageOf(uint256 tokenId) view returns (bool insured, bool claimed, bool claimable, uint16 payoutBps, uint64 weatherRoundId, uint256 premiumPaid, uint256 payoutAmount)",
  "function mintStandard(bool insured) payable",
  "function mintFanPass(bytes attestation, bool insured, uint256 deadline) payable",
  "function setBaseUris(string baseTokenURI, string collectibleBaseURI)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Paused(address account)",
  "event Unpaused(address account)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "event CollectibleModeUpdated(bool enabled)",
  "event BaseUrisUpdated(string baseTokenURI, string collectibleBaseURI)",
] as const;

export const MARKETPLACE_ABI = [
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event Cancelled(uint256 indexed tokenId, address indexed actor)",
  "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 feeAmount)",
] as const;

export const CHECKIN_ABI = [
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
  "event TicketMarkedUsed(uint256 indexed tokenId, address indexed scanner)",
] as const;

export const FACTORY_ABI = [
  "function totalEvents() view returns (uint256)",
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,uint256 primaryPrice,uint256 maxSupply,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,uint256 deploymentBlock,uint256 registeredAt))",
  "function getEventById(string eventId) view returns ((string eventId,string name,string symbol,uint256 primaryPrice,uint256 maxSupply,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,uint256 deploymentBlock,uint256 registeredAt))",
] as const;

export const FACTORY_V2_ABI = [
  "function totalEvents() view returns (uint256)",
  "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
  "function getEventById(string eventId) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
] as const;

export const FAN_SCORE_REGISTRY_ABI = [
  "function reputationOf(address fan) view returns (uint256)",
  "function tierOf(address fan) view returns (uint8)",
  "function artistAttendanceOf(address fan, bytes32 artistKey) view returns (uint256)",
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

export const INSURANCE_POOL_ABI = [
  "function currentPolicy() view returns (bool active, uint16 payoutBps, uint64 roundId, bytes32 reportHash)",
  "function claim(uint256 tokenId)",
] as const;

export const MERCH_STORE_ABI = [
  "function getSku(string skuId) view returns (tuple(string skuId, uint256 price, uint256 stock, bool active))",
  "function redeem(string skuId)",
  "event SkuConfigured(bytes32 indexed skuKey, string indexed skuId, uint256 price, uint256 stock, bool active)",
  "event Redeemed(bytes32 indexed skuKey, string indexed skuId, address indexed fan, uint256 merchTwinId, uint256 fuelCost)",
] as const;
