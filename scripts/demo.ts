import fs from "node:fs";
import path from "node:path";

import { network } from "hardhat";

const { ethers } = await network.connect();

interface DeploymentManifest {
  eventId: string;
  eventName: string;
  artistId: string;
  deploymentBlock: number;
  primaryPriceWei: string;
  insurancePremiumWei: string;
  fanPassAllocationBps: string;
  artistRoyaltyBps: string;
  addresses: {
    ticketNftAddress: string;
    marketplaceAddress: string;
    checkInRegistryAddress: string;
    insurancePoolAddress: string;
    oracleAdapterAddress: string;
    perkManagerAddress: string;
    merchStoreAddress: string;
    merchTwinAddress: string;
    collectibleAddress: string;
  };
  seeded: {
    perks: Array<{ id: string; minScore: string; minAttendances: string; fuelCost: string }>;
    skus: Array<{ id: string; price: string; stock: string }>;
    weatherPolicy: {
      roundId: number;
      payoutBps: number;
      reportHash: string;
    } | null;
  };
}

function loadManifest(): DeploymentManifest {
  const manifestPath =
    process.env.DEPLOYMENT_MANIFEST_PATH?.trim() ||
    path.resolve(process.cwd(), "deployments", "amoy", "current.json");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Deployment manifest not found: ${manifestPath}`);
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as DeploymentManifest;
}

async function main(): Promise<void> {
  const manifest = loadManifest();
  const [operator] = await ethers.getSigners();

  const ticket = await ethers.getContractAt(
    "TicketNFTV2",
    manifest.addresses.ticketNftAddress,
    operator,
  );
  const marketplace = await ethers.getContractAt(
    "MarketplaceV2",
    manifest.addresses.marketplaceAddress,
    operator,
  );
  const checkInRegistry = await ethers.getContractAt(
    "CheckInRegistryV2",
    manifest.addresses.checkInRegistryAddress,
    operator,
  );
  const insurancePool = await ethers.getContractAt(
    "InsurancePool",
    manifest.addresses.insurancePoolAddress,
    operator,
  );
  const fanScore = await ethers.getContractAt(
    "FanScoreRegistry",
    await ticket.fanScoreRegistry(),
    operator,
  );
  const fanFuel = await ethers.getContractAt(
    "FanFuelBank",
    await ticket.fanFuelBank(),
    operator,
  );

  const [
    totalMinted,
    fanPassMinted,
    policy,
    paused,
    collectibleMode,
    baseUris,
  ] = await Promise.all([
    ticket.totalMinted(),
    ticket.fanPassMinted(),
    insurancePool.currentPolicy(),
    ticket.paused(),
    ticket.collectibleMode(),
    ticket.baseUris(),
  ]);

  console.log("ChainTicket Amoy deployment check");
  console.log(`Operator: ${operator.address}`);
  console.log(`Event: ${manifest.eventName} (${manifest.eventId})`);
  console.log(`Artist: ${manifest.artistId}`);
  console.log(`Deployment block: ${manifest.deploymentBlock}`);
  console.log("");
  console.log("Core rails");
  console.log(`TicketNFTV2: ${manifest.addresses.ticketNftAddress}`);
  console.log(`MarketplaceV2: ${manifest.addresses.marketplaceAddress}`);
  console.log(`CheckInRegistryV2: ${manifest.addresses.checkInRegistryAddress}`);
  console.log(`InsurancePool: ${manifest.addresses.insurancePoolAddress}`);
  console.log(`CollectibleNFT: ${manifest.addresses.collectibleAddress}`);
  console.log(`PerkManager: ${manifest.addresses.perkManagerAddress}`);
  console.log(`MerchStore: ${manifest.addresses.merchStoreAddress}`);
  console.log("");
  console.log("Live status");
  console.log(`Paused: ${paused}`);
  console.log(`Collectible mode: ${collectibleMode}`);
  console.log(`Primary price: ${ethers.formatEther(manifest.primaryPriceWei)} POL`);
  console.log(`Insurance premium: ${ethers.formatEther(manifest.insurancePremiumWei)} POL`);
  console.log(`Minted supply: ${totalMinted.toString()}`);
  console.log(`FanPass minted: ${fanPassMinted.toString()} / ${manifest.fanPassAllocationBps} bps`);
  console.log(`Artist royalty: ${Number(manifest.artistRoyaltyBps) / 100}%`);
  console.log(`Base ticket URI: ${baseUris[0]}`);
  console.log(`Base collectible URI: ${baseUris[1]}`);
  console.log(`Insurance policy active: ${policy.active}`);
  console.log(`Insurance payout bps: ${policy.payoutBps}`);
  console.log(`Insurance round id: ${policy.roundId}`);
  console.log("");
  console.log("Seeded fan rails");
  console.log(
    `Perks configured in manifest: ${
      manifest.seeded.perks.length > 0
        ? manifest.seeded.perks.map((perk) => perk.id).join(", ")
        : "none"
    }`,
  );
  console.log(
    `Merch SKUs configured in manifest: ${
      manifest.seeded.skus.length > 0
        ? manifest.seeded.skus.map((sku) => sku.id).join(", ")
        : "none"
    }`,
  );
  if (manifest.seeded.weatherPolicy) {
    console.log(
      `Weather demo policy: round ${manifest.seeded.weatherPolicy.roundId}, payout ${manifest.seeded.weatherPolicy.payoutBps / 100}%`,
    );
  }
  console.log("");
  console.log("Operator visibility");
  console.log(`BUYBACK_ROLE: ${await marketplace.BUYBACK_ROLE()}`);
  console.log(`SCANNER_ROLE: ${await checkInRegistry.SCANNER_ROLE()}`);
  console.log(`Operator reputation: ${await fanScore.reputationOf(operator.address)}`);
  console.log(`Operator Fan-Fuel: ${await fanFuel.balanceOf(operator.address)}`);
  console.log("");
  console.log("This script now validates the canonical upgraded deployment.");
  console.log("Use scripts/demo-local.ts for a full end-to-end transaction walkthrough.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
