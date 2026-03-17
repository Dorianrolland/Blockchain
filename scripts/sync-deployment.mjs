import fs from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const manifestPath =
  process.argv[2] ||
  path.join(workspaceRoot, "deployments", "amoy", "current.json");

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/);
}

function upsertEnv(lines, entries) {
  const nextLines = [...lines];

  for (const [key, value] of Object.entries(entries)) {
    const rendered = `${key}=${value ?? ""}`;
    const index = nextLines.findIndex((line) => line.startsWith(`${key}=`));
    if (index >= 0) {
      nextLines[index] = rendered;
    } else {
      if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") {
        nextLines.push("");
      }
      nextLines.push(rendered);
    }
  }

  return nextLines;
}

function writeEnvFile(filePath, lines) {
  const normalized = [...lines];
  while (normalized.length > 0 && normalized[normalized.length - 1] === "") {
    normalized.pop();
  }
  fs.writeFileSync(filePath, `${normalized.join("\n")}\n`, "utf8");
}

function formatEtherLike(weiString) {
  const value = BigInt(weiString);
  const whole = value / 10n ** 18n;
  const fraction = value % 10n ** 18n;
  if (fraction === 0n) {
    return whole.toString();
  }
  return `${whole}.${fraction.toString().padStart(18, "0").replace(/0+$/, "")}`;
}

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Deployment manifest not found: ${manifestPath}`);
}

const manifest = loadJson(manifestPath);
const rootEnvPath = path.join(workspaceRoot, ".env");
const bffEnvPath = path.join(workspaceRoot, "bff", ".env");
const frontendEnvPath = path.join(workspaceRoot, "frontend", ".env");

const rootEnvLines = readEnvFile(rootEnvPath);
const bffEnvLines = readEnvFile(bffEnvPath);
const frontendEnvLines = readEnvFile(frontendEnvPath);

const privateKeyLine = rootEnvLines.find((line) => line.startsWith("PRIVATE_KEY="));
const privateKey = privateKeyLine ? privateKeyLine.slice("PRIVATE_KEY=".length).trim() : "";

const rootEntries = {
  EVENT_ID: manifest.eventId,
  DEPLOYMENT_BLOCK: String(manifest.deploymentBlock),
  CHAIN_TICKET_FACTORY_ADDRESS: manifest.addresses.factoryAddress ?? "",
  TICKET_NFT_ADDRESS: manifest.addresses.ticketNftAddress,
  MARKETPLACE_ADDRESS: manifest.addresses.marketplaceAddress,
  CHECKIN_REGISTRY_ADDRESS: manifest.addresses.checkInRegistryAddress,
  ARTIST_ID: manifest.artistId,
  SERIES_ID: manifest.seriesId,
  PRIMARY_PRICE_POL: formatEtherLike(manifest.primaryPriceWei),
  INSURANCE_PREMIUM_POL: formatEtherLike(manifest.insurancePremiumWei),
  MAX_SUPPLY: manifest.maxSupply,
  FANPASS_ALLOCATION_BPS: manifest.fanPassAllocationBps,
  ARTIST_ROYALTY_BPS: manifest.artistRoyaltyBps,
  BASE_TOKEN_URI: manifest.baseUris.ticket,
  COLLECTIBLE_BASE_URI: manifest.baseUris.collectible,
  MERCH_BASE_URI: manifest.baseUris.merch,
  TREASURY_ADDRESS: manifest.treasury,
  ATTESTATION_SIGNER_ADDRESS: manifest.attestationSigner,
  DEPLOY_CHAIN_TICKET_FACTORY: "false",
  DEPLOY_CHAIN_TICKET_FACTORY_V2: "false",
  CHAIN_TICKET_FACTORY_V2_ADDRESS: manifest.addresses.factoryAddress ?? "",
};

const bffEntries = {
  FACTORY_ADDRESS: manifest.addresses.factoryAddress ?? "",
  DEFAULT_EVENT_ID: manifest.eventId,
  FANPASS_ATTESTATION_PRIVATE_KEY: privateKey,
};

const frontendEntries = {
  VITE_DEPLOYMENT_BLOCK: String(manifest.deploymentBlock),
  VITE_DEFAULT_EVENT_ID: manifest.eventId,
  VITE_DEFAULT_EVENT_NAME: manifest.eventName,
  VITE_FACTORY_ADDRESS: manifest.addresses.factoryAddress ?? "",
  VITE_TICKET_NFT_ADDRESS: manifest.addresses.ticketNftAddress,
  VITE_MARKETPLACE_ADDRESS: manifest.addresses.marketplaceAddress,
  VITE_CHECKIN_REGISTRY_ADDRESS: manifest.addresses.checkInRegistryAddress,
  VITE_FAN_FUEL_BANK_ADDRESS: manifest.addresses.fanFuelBankAddress,
  VITE_PERK_MANAGER_ADDRESS: manifest.addresses.perkManagerAddress,
  VITE_MERCH_STORE_ADDRESS: manifest.addresses.merchStoreAddress,
  VITE_INSURANCE_POOL_ADDRESS: manifest.addresses.insurancePoolAddress,
};

writeEnvFile(rootEnvPath, upsertEnv(rootEnvLines, rootEntries));
writeEnvFile(bffEnvPath, upsertEnv(bffEnvLines, bffEntries));
writeEnvFile(frontendEnvPath, upsertEnv(frontendEnvLines, frontendEntries));

console.log(`Synchronized runtime env files from ${manifestPath}`);
console.log(`- ${rootEnvPath}`);
console.log(`- ${bffEnvPath}`);
console.log(`- ${frontendEnvPath}`);
