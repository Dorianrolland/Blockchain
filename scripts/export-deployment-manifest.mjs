import fs from "node:fs";
import path from "node:path";

import { Contract, JsonRpcProvider } from "ethers";

function readEnv(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

function stringifyJson(value) {
  return `${JSON.stringify(
    value,
    (_, current) => (typeof current === "bigint" ? current.toString() : current),
    2,
  )}\n`;
}

const workspaceRoot = process.cwd();
const env = readEnv(path.join(workspaceRoot, ".env"));
const rpcUrl = env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
const factoryAddress = process.argv[2];
const eventId = process.argv[3];
const outputPath =
  process.argv[4] || path.join(workspaceRoot, "deployments", "amoy", `${eventId}.json`);

if (!factoryAddress || !eventId) {
  throw new Error(
    "Usage: node scripts/export-deployment-manifest.mjs <factoryAddress> <eventId> [outputPath]",
  );
}

const provider = new JsonRpcProvider(rpcUrl, 80002);

const FACTORY_V2_ABI = [
  "function getEventById(string eventId) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
];

const TICKET_ABI = [
  "function insurancePremium() view returns (uint256)",
  "function attestationSigner() view returns (address)",
  "function baseUris() view returns (string baseTokenURI, string collectibleBaseURI)",
];

const MERCH_STORE_ABI = [
  "function merchTwinNFT() view returns (address)",
];

const INSURANCE_POOL_ABI = [
  "function currentPolicy() view returns (bool active, uint16 payoutBps, uint64 roundId, bytes32 reportHash)",
];

const factory = new Contract(factoryAddress, FACTORY_V2_ABI, provider);
const rawEvent = await factory.getEventById(eventId);

const event = Array.isArray(rawEvent)
  ? {
      eventId: String(rawEvent[0]),
      name: String(rawEvent[1]),
      symbol: String(rawEvent[2]),
      artistId: String(rawEvent[3]),
      seriesId: String(rawEvent[4]),
      primaryPrice: BigInt(rawEvent[5]),
      maxSupply: BigInt(rawEvent[6]),
      fanPassAllocationBps: BigInt(rawEvent[7]),
      artistRoyaltyBps: BigInt(rawEvent[8]),
      treasury: String(rawEvent[9]),
      admin: String(rawEvent[10]),
      ticketNFT: String(rawEvent[11]),
      marketplace: String(rawEvent[12]),
      checkInRegistry: String(rawEvent[13]),
      collectibleContract: String(rawEvent[14]),
      fanScoreRegistry: String(rawEvent[15]),
      fanFuelBank: String(rawEvent[16]),
      insurancePool: String(rawEvent[17]),
      oracleAdapter: String(rawEvent[18]),
      merchStore: String(rawEvent[19]),
      perkManager: String(rawEvent[20]),
      deploymentBlock: Number(rawEvent[21]),
      registeredAt: Number(rawEvent[22]),
    }
  : {
      eventId: String(rawEvent.eventId),
      name: String(rawEvent.name),
      symbol: String(rawEvent.symbol),
      artistId: String(rawEvent.artistId),
      seriesId: String(rawEvent.seriesId),
      primaryPrice: BigInt(rawEvent.primaryPrice),
      maxSupply: BigInt(rawEvent.maxSupply),
      fanPassAllocationBps: BigInt(rawEvent.fanPassAllocationBps),
      artistRoyaltyBps: BigInt(rawEvent.artistRoyaltyBps),
      treasury: String(rawEvent.treasury),
      admin: String(rawEvent.admin),
      ticketNFT: String(rawEvent.ticketNFT),
      marketplace: String(rawEvent.marketplace),
      checkInRegistry: String(rawEvent.checkInRegistry),
      collectibleContract: String(rawEvent.collectibleContract),
      fanScoreRegistry: String(rawEvent.fanScoreRegistry),
      fanFuelBank: String(rawEvent.fanFuelBank),
      insurancePool: String(rawEvent.insurancePool),
      oracleAdapter: String(rawEvent.oracleAdapter),
      merchStore: String(rawEvent.merchStore),
      perkManager: String(rawEvent.perkManager),
      deploymentBlock: Number(rawEvent.deploymentBlock),
      registeredAt: Number(rawEvent.registeredAt),
    };

const ticket = new Contract(event.ticketNFT, TICKET_ABI, provider);
const merchStore = new Contract(event.merchStore, MERCH_STORE_ABI, provider);
const insurancePool = new Contract(event.insurancePool, INSURANCE_POOL_ABI, provider);

const [insurancePremium, attestationSigner, baseUris, merchTwinAddress, currentPolicy, network] =
  await Promise.all([
    ticket.insurancePremium(),
    ticket.attestationSigner(),
    ticket.baseUris(),
    merchStore.merchTwinNFT(),
    insurancePool.currentPolicy(),
    provider.getNetwork(),
  ]);

const manifest = {
  productLine: "upgraded",
  network: "amoy",
  chainId: Number(network.chainId),
  eventId: event.eventId,
  eventName: event.name,
  eventSymbol: event.symbol,
  artistId: event.artistId,
  seriesId: event.seriesId,
  deploymentBlock: event.deploymentBlock,
  deployedAt: new Date(event.registeredAt * 1000).toISOString(),
  primaryPriceWei: event.primaryPrice.toString(),
  insurancePremiumWei: BigInt(insurancePremium).toString(),
  maxSupply: event.maxSupply.toString(),
  fanPassAllocationBps: event.fanPassAllocationBps.toString(),
  artistRoyaltyBps: event.artistRoyaltyBps.toString(),
  treasury: event.treasury,
  attestationSigner: String(attestationSigner),
  addresses: {
    factoryAddress,
    ticketNftAddress: event.ticketNFT,
    marketplaceAddress: event.marketplace,
    checkInRegistryAddress: event.checkInRegistry,
    collectibleAddress: event.collectibleContract,
    fanScoreRegistryAddress: event.fanScoreRegistry,
    fanFuelBankAddress: event.fanFuelBank,
    insurancePoolAddress: event.insurancePool,
    oracleAdapterAddress: event.oracleAdapter,
    perkManagerAddress: event.perkManager,
    merchTwinAddress: String(merchTwinAddress),
    merchStoreAddress: event.merchStore,
  },
  baseUris: {
    ticket: String(baseUris[0] ?? ""),
    collectible: String(baseUris[1] ?? ""),
    merch: env.MERCH_BASE_URI || "ipfs://chainticket/merch/",
  },
  seeded: {
    perks: [],
    skus: [],
    weatherPolicy:
      currentPolicy && Boolean(currentPolicy[0])
        ? {
            roundId: Number(currentPolicy[2] ?? 0),
            payoutBps: Number(currentPolicy[1] ?? 0),
            reportHash: String(currentPolicy[3] ?? ""),
          }
        : null,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, stringifyJson(manifest), "utf8");

const latestPath = path.join(path.dirname(outputPath), "current.json");
if (path.resolve(outputPath) !== path.resolve(latestPath)) {
  fs.writeFileSync(latestPath, stringifyJson(manifest), "utf8");
}

console.log(`Deployment manifest exported to ${outputPath}`);
