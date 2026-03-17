import fs from "node:fs";
import path from "node:path";

import { Contract } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.connect();

interface SeededPerk {
  id: string;
  minScore: bigint;
  minAttendances: bigint;
  fuelCost: bigint;
  metadataURI: string;
}

interface SeededSku {
  id: string;
  price: bigint;
  stock: bigint;
}

interface DeploymentManifest {
  productLine: "upgraded";
  network: string;
  chainId: number;
  eventId: string;
  eventName: string;
  eventSymbol: string;
  artistId: string;
  seriesId: string;
  deploymentBlock: number;
  deployedAt: string;
  primaryPriceWei: string;
  insurancePremiumWei: string;
  maxSupply: string;
  fanPassAllocationBps: string;
  artistRoyaltyBps: string;
  treasury: string;
  attestationSigner: string;
  addresses: {
    factoryAddress: string | null;
    ticketNftAddress: string;
    marketplaceAddress: string;
    checkInRegistryAddress: string;
    collectibleAddress: string;
    fanScoreRegistryAddress: string;
    fanFuelBankAddress: string;
    insurancePoolAddress: string;
    oracleAdapterAddress: string;
    perkManagerAddress: string;
    merchTwinAddress: string;
    merchStoreAddress: string;
  };
  baseUris: {
    ticket: string;
    collectible: string;
    merch: string;
  };
  seeded: {
    perks: SeededPerk[];
    skus: SeededSku[];
    weatherPolicy: {
      roundId: number;
      payoutBps: number;
      reportHash: string;
    } | null;
  };
}

type TxOverrides = {
  gasPrice?: bigint;
  value?: bigint;
};

function parseCsvAddresses(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function uniqueValidAddresses(raw: string, label: string): string[] {
  return [
    ...new Set(
      parseCsvAddresses(raw).filter((address) => {
        const isValid = ethers.isAddress(address);
        if (!isValid) {
          console.warn(`Skipping invalid ${label} address: ${address}`);
        }
        return isValid;
      }),
    ),
  ];
}

function requireAddress(raw: string | undefined, label: string, fallback?: string): string {
  const value = raw?.trim() || fallback || "";
  if (!ethers.isAddress(value)) {
    throw new Error(`Invalid ${label}: ${value || "<empty>"}`);
  }
  return value;
}

function envOrFallback(primaryKey: string, secondaryKey: string | null, fallback: string): string {
  const primary = process.env[primaryKey]?.trim();
  if (primary && primary.length > 0) {
    return primary;
  }
  if (secondaryKey) {
    const secondary = process.env[secondaryKey]?.trim();
    if (secondary && secondary.length > 0) {
      return secondary;
    }
  }
  return fallback;
}

function explorerBaseUrl(): string {
  return "https://amoy.polygonscan.com";
}

function explorerAddressLink(address: string): string {
  return `${explorerBaseUrl()}/address/${address}`;
}

function explorerTxLink(txHash: string): string {
  return `${explorerBaseUrl()}/tx/${txHash}`;
}

async function grantRoleIfMissing(
  contract: Contract,
  role: string,
  account: string,
  txOverrides: TxOverrides,
): Promise<void> {
  const hasRole = await contract.hasRole(role, account);
  if (hasRole) {
    return;
  }

  const tx = await contract.grantRole(role, account, txOverrides);
  await tx.wait();
  console.log(`Granted role ${role} to ${account}: ${explorerTxLink(tx.hash)}`);
}

function buildSeededPerks(artistId: string): SeededPerk[] {
  return [
    {
      id: `${artistId}:early-access`,
      minScore: 10n,
      minAttendances: 0n,
      fuelCost: 0n,
      metadataURI: `ipfs://chainticket/perks/${artistId}/early-access.json`,
    },
    {
      id: `${artistId}:presale-window`,
      minScore: 20n,
      minAttendances: 0n,
      fuelCost: 5n,
      metadataURI: `ipfs://chainticket/perks/${artistId}/presale-window.json`,
    },
    {
      id: `${artistId}:backstage`,
      minScore: 40n,
      minAttendances: 1n,
      fuelCost: 15n,
      metadataURI: `ipfs://chainticket/perks/${artistId}/backstage.json`,
    },
  ];
}

function buildSeededSkus(artistId: string): SeededSku[] {
  return [
    {
      id: `${artistId}-tee-black-limited`,
      price: 5n,
      stock: 50n,
    },
    {
      id: `${artistId}-vinyl-gold`,
      price: 15n,
      stock: 25n,
    },
  ];
}

function ensureDirectoryFor(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeManifest(manifestPath: string, manifest: DeploymentManifest): void {
  ensureDirectoryFor(manifestPath);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      manifest,
      (_, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    )}\n`,
    "utf8",
  );
}

async function buildTxOverrides(): Promise<TxOverrides> {
  const explicitGasPriceGwei = process.env.DEPLOY_GAS_PRICE_GWEI?.trim();
  if (explicitGasPriceGwei) {
    return {
      gasPrice: ethers.parseUnits(explicitGasPriceGwei, "gwei"),
    };
  }

  const cappedGasPriceGwei = process.env.DEPLOY_MAX_GAS_PRICE_GWEI?.trim();
  if (!cappedGasPriceGwei) {
    return {};
  }

  const cap = ethers.parseUnits(cappedGasPriceGwei, "gwei");
  const feeData = await ethers.provider.getFeeData();
  if (feeData.gasPrice && feeData.gasPrice > cap) {
    return { gasPrice: cap };
  }

  return {};
}

function mergeTxOverrides(
  base: TxOverrides,
  extra: TxOverrides = {},
): TxOverrides {
  return {
    ...base,
    ...extra,
  };
}

async function configureSeededPerks(
  perkManager: Contract,
  artistKey: string,
  seededPerks: SeededPerk[],
  txOverrides: TxOverrides,
): Promise<void> {
  for (const perk of seededPerks) {
    const perkId = ethers.keccak256(ethers.toUtf8Bytes(perk.id));
    const tx = await perkManager.configurePerk(
      perkId,
      artistKey,
      perk.minScore,
      perk.minAttendances,
      perk.fuelCost,
      perk.metadataURI,
      true,
      txOverrides,
    );
    await tx.wait();
    console.log(`Configured perk ${perk.id}: ${explorerTxLink(tx.hash)}`);
  }
}

async function configureSeededMerch(
  merchStore: Contract,
  seededSkus: SeededSku[],
  txOverrides: TxOverrides,
): Promise<void> {
  for (const sku of seededSkus) {
    const tx = await merchStore.configureSku(
      sku.id,
      sku.price,
      sku.stock,
      true,
      txOverrides,
    );
    await tx.wait();
    console.log(`Configured SKU ${sku.id}: ${explorerTxLink(tx.hash)}`);
  }
}

async function maybePublishWeatherDemo(
  oracleAdapter: Contract,
  eventId: string,
  txOverrides: TxOverrides,
): Promise<{ roundId: number; payoutBps: number; reportHash: string } | null> {
  const payoutBps = Number(process.env.DEMO_WEATHER_PAYOUT_BPS ?? "0");
  if (!Number.isFinite(payoutBps) || payoutBps < 0 || payoutBps > 10_000) {
    throw new Error(`Invalid DEMO_WEATHER_PAYOUT_BPS: ${process.env.DEMO_WEATHER_PAYOUT_BPS}`);
  }
  if (payoutBps === 0) {
    return null;
  }

  const roundId = Number(process.env.DEMO_WEATHER_ROUND_ID ?? "1");
  if (!Number.isFinite(roundId) || roundId <= 0) {
    throw new Error(`Invalid DEMO_WEATHER_ROUND_ID: ${process.env.DEMO_WEATHER_ROUND_ID}`);
  }

  const reportHash = ethers.keccak256(
    ethers.toUtf8Bytes(`weather-demo:${eventId}:${roundId}:${payoutBps}`),
  );
  const tx = await oracleAdapter.publishWeatherOutcome(
    roundId,
    payoutBps,
    reportHash,
    txOverrides,
  );
  await tx.wait();
  console.log(`Published weather demo policy: ${explorerTxLink(tx.hash)}`);

  return { roundId, payoutBps, reportHash };
}

async function main(): Promise<void> {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No deployer account configured for this network.");
  }
  const deployer = signers[0];

  const name = process.env.TICKET_NAME ?? "ChainTicket Event";
  const symbol = process.env.TICKET_SYMBOL ?? "CTK";
  const eventId = process.env.EVENT_ID?.trim() || `chainticket-upgrade-${Date.now()}`;
  const artistId = process.env.ARTIST_ID?.trim() || "artist-alpha";
  const seriesId = process.env.SERIES_ID?.trim() || "tour-2026";
  const baseTokenURI = process.env.BASE_TOKEN_URI ?? "ipfs://chainticket/tickets/";
  const collectibleBaseURI =
    process.env.COLLECTIBLE_BASE_URI ?? "ipfs://chainticket/collectibles/";
  const merchBaseURI = process.env.MERCH_BASE_URI ?? "ipfs://chainticket/merch/";
  const treasury = requireAddress(process.env.TREASURY_ADDRESS, "TREASURY_ADDRESS", deployer.address);
  const attestationSigner = requireAddress(
    process.env.ATTESTATION_SIGNER_ADDRESS,
    "ATTESTATION_SIGNER_ADDRESS",
    deployer.address,
  );
  const primaryPrice = ethers.parseEther(process.env.PRIMARY_PRICE_POL ?? "0.1");
  const insurancePremium = ethers.parseEther(process.env.INSURANCE_PREMIUM_POL ?? "0.01");
  const insurancePoolSeed = ethers.parseEther(process.env.INSURANCE_POOL_SEED_POL ?? "1.0");
  const maxSupply = BigInt(process.env.MAX_SUPPLY ?? "100");
  const fanPassAllocationBps = BigInt(process.env.FANPASS_ALLOCATION_BPS ?? "3000");
  const artistRoyaltyBps = BigInt(process.env.ARTIST_ROYALTY_BPS ?? "500");

  const scannerAddresses = uniqueValidAddresses(process.env.SCANNER_ADDRESSES ?? "", "scanner");
  const scannerAdminAddresses = uniqueValidAddresses(
    process.env.SCANNER_ADMIN_ADDRESSES ?? deployer.address,
    "scanner admin",
  );
  const pauserAddresses = uniqueValidAddresses(
    process.env.PAUSER_ADDRESSES ?? deployer.address,
    "pauser",
  );
  const reporterAddresses = uniqueValidAddresses(
    process.env.REPORTER_ADDRESSES ?? deployer.address,
    "weather reporter",
  );
  const buybackOperatorAddresses = uniqueValidAddresses(
    process.env.BUYBACK_OPERATOR_ADDRESSES ?? treasury,
    "buyback operator",
  );
  const deployFactory = parseBoolean(
    process.env.DEPLOY_CHAIN_TICKET_FACTORY ?? process.env.DEPLOY_CHAIN_TICKET_FACTORY_V2,
    false,
  );
  const factoryAddressFromEnv =
    process.env.CHAIN_TICKET_FACTORY_ADDRESS?.trim() ||
    process.env.CHAIN_TICKET_FACTORY_V2_ADDRESS?.trim() ||
    "";
  const manifestPath = envOrFallback(
    "DEPLOYMENT_MANIFEST_PATH",
    null,
    path.resolve(process.cwd(), "deployments", "amoy", `${eventId}.json`),
  );
  const latestManifestPath = envOrFallback(
    "LATEST_DEPLOYMENT_MANIFEST_PATH",
    null,
    path.resolve(process.cwd(), "deployments", "amoy", "current.json"),
  );
  const seedPerks = parseBoolean(process.env.SEED_DEMO_PERKS, true);
  const seedMerch = parseBoolean(process.env.SEED_DEMO_MERCH, true);

  if ((deployFactory || factoryAddressFromEnv) && !eventId) {
    throw new Error("EVENT_ID is required when using ChainTicketFactoryV2 registration.");
  }

  console.log("Deploying canonical ChainTicket upgrade contracts...");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`Artist: ${artistId}`);
  console.log(`Event ID: ${eventId}`);

  const deploymentTxOverrides = await buildTxOverrides();
  if (deploymentTxOverrides.gasPrice) {
    console.log(
      `Deployment gas price capped at ${ethers.formatUnits(
        deploymentTxOverrides.gasPrice,
        "gwei",
      )} gwei`,
    );
  }

  let factoryAddress: string | null = factoryAddressFromEnv || null;
  let chainTicketFactory: Contract | null = null;
  if (deployFactory) {
    const factoryFactory = await ethers.getContractFactory("ChainTicketFactoryV2", deployer);
    const factory = await factoryFactory.deploy(deployer.address, deploymentTxOverrides);
    await factory.waitForDeployment();
    factoryAddress = await factory.getAddress();
    chainTicketFactory = factory as unknown as Contract;
    console.log(`ChainTicketFactoryV2 deployed: ${factoryAddress}`);
  } else if (factoryAddress) {
    chainTicketFactory = (await ethers.getContractAt(
      "ChainTicketFactoryV2",
      factoryAddress,
      deployer,
    )) as unknown as Contract;
    console.log(`Using ChainTicketFactoryV2: ${factoryAddress}`);
  }

  const fanScoreRegistryFactory = await ethers.getContractFactory("FanScoreRegistry", deployer);
  const fanScoreRegistry = await fanScoreRegistryFactory.deploy(
    deployer.address,
    deploymentTxOverrides,
  );
  await fanScoreRegistry.waitForDeployment();
  const fanScoreRegistryAddress = await fanScoreRegistry.getAddress();

  const fanFuelBankFactory = await ethers.getContractFactory("FanFuelBank", deployer);
  const fanFuelBank = await fanFuelBankFactory.deploy(deployer.address, deploymentTxOverrides);
  await fanFuelBank.waitForDeployment();
  const fanFuelBankAddress = await fanFuelBank.getAddress();

  const collectibleFactory = await ethers.getContractFactory("CollectibleNFT", deployer);
  const collectibleNFT = await collectibleFactory.deploy(
    `${name} Collectibles`,
    `${symbol}C`,
    artistId,
    collectibleBaseURI,
    fanScoreRegistryAddress,
    deployer.address,
    deploymentTxOverrides,
  );
  await collectibleNFT.waitForDeployment();
  const collectibleAddress = await collectibleNFT.getAddress();

  const ticketFactory = await ethers.getContractFactory("TicketNFTV2", deployer);
  const ticket = await ticketFactory.deploy(
    name,
    symbol,
    artistId,
    seriesId,
    primaryPrice,
    insurancePremium,
    maxSupply,
    fanPassAllocationBps,
    artistRoyaltyBps,
    treasury,
    baseTokenURI,
    attestationSigner,
    fanScoreRegistryAddress,
    fanFuelBankAddress,
    deployer.address,
    deploymentTxOverrides,
  );
  await ticket.waitForDeployment();
  const ticketAddress = await ticket.getAddress();

  const insurancePoolFactory = await ethers.getContractFactory("InsurancePool", deployer);
  const insurancePool = await insurancePoolFactory.deploy(
    ticketAddress,
    deployer.address,
    deploymentTxOverrides,
  );
  await insurancePool.waitForDeployment();
  const insurancePoolAddress = await insurancePool.getAddress();

  const weatherOracleAdapterFactory = await ethers.getContractFactory("WeatherOracleAdapter", deployer);
  const weatherOracleAdapter = await weatherOracleAdapterFactory.deploy(
    insurancePoolAddress,
    deployer.address,
    deploymentTxOverrides,
  );
  await weatherOracleAdapter.waitForDeployment();
  const weatherOracleAdapterAddress = await weatherOracleAdapter.getAddress();

  const merchTwinFactory = await ethers.getContractFactory("MerchTwinNFT", deployer);
  const merchTwinNFT = await merchTwinFactory.deploy(
    `${name} Merch Twins`,
    `${symbol}M`,
    merchBaseURI,
    deployer.address,
    deploymentTxOverrides,
  );
  await merchTwinNFT.waitForDeployment();
  const merchTwinAddress = await merchTwinNFT.getAddress();

  const merchStoreFactory = await ethers.getContractFactory("MerchStore", deployer);
  const merchStore = await merchStoreFactory.deploy(
    fanFuelBankAddress,
    merchTwinAddress,
    deployer.address,
    deploymentTxOverrides,
  );
  await merchStore.waitForDeployment();
  const merchStoreAddress = await merchStore.getAddress();

  const perkManagerFactory = await ethers.getContractFactory("PerkManager", deployer);
  const perkManager = await perkManagerFactory.deploy(
    fanScoreRegistryAddress,
    fanFuelBankAddress,
    deployer.address,
    deploymentTxOverrides,
  );
  await perkManager.waitForDeployment();
  const perkManagerAddress = await perkManager.getAddress();

  const marketplaceFactory = await ethers.getContractFactory("MarketplaceV2", deployer);
  const marketplace = await marketplaceFactory.deploy(
    ticketAddress,
    treasury,
    artistRoyaltyBps,
    await ticket.artistKey(),
    fanScoreRegistryAddress,
    fanFuelBankAddress,
    deployer.address,
    deploymentTxOverrides,
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();

  const checkInFactory = await ethers.getContractFactory("CheckInRegistryV2", deployer);
  const checkInRegistry = await checkInFactory.deploy(
    ticketAddress,
    collectibleAddress,
    fanScoreRegistryAddress,
    fanFuelBankAddress,
    await ticket.artistKey(),
    deployer.address,
    deploymentTxOverrides,
  );
  await checkInRegistry.waitForDeployment();
  const checkInRegistryAddress = await checkInRegistry.getAddress();

  const setBaseUrisTx = await ticket.setBaseUris(
    baseTokenURI,
    collectibleBaseURI,
    deploymentTxOverrides,
  );
  await setBaseUrisTx.wait();
  console.log(`setBaseUris tx: ${explorerTxLink(setBaseUrisTx.hash)}`);

  const setMarketplaceTx = await ticket.setMarketplace(marketplaceAddress, deploymentTxOverrides);
  await setMarketplaceTx.wait();
  console.log(`setMarketplace tx: ${explorerTxLink(setMarketplaceTx.hash)}`);

  const setCheckInRegistryTx = await ticket.setCheckInRegistry(
    checkInRegistryAddress,
    deploymentTxOverrides,
  );
  await setCheckInRegistryTx.wait();
  console.log(`setCheckInRegistry tx: ${explorerTxLink(setCheckInRegistryTx.hash)}`);

  const setInsurancePoolTx = await ticket.setInsurancePool(
    insurancePoolAddress,
    deploymentTxOverrides,
  );
  await setInsurancePoolTx.wait();
  console.log(`setInsurancePool tx: ${explorerTxLink(setInsurancePoolTx.hash)}`);

  const scoreSourceRole = await fanScoreRegistry.SOURCE_ROLE();
  for (const account of [ticketAddress, marketplaceAddress, checkInRegistryAddress]) {
    await grantRoleIfMissing(
      fanScoreRegistry as unknown as Contract,
      scoreSourceRole,
      account,
      deploymentTxOverrides,
    );
  }

  const rewarderRole = await fanFuelBank.REWARDER_ROLE();
  for (const account of [ticketAddress, marketplaceAddress, checkInRegistryAddress]) {
    await grantRoleIfMissing(
      fanFuelBank as unknown as Contract,
      rewarderRole,
      account,
      deploymentTxOverrides,
    );
  }

  const spenderRole = await fanFuelBank.SPENDER_ROLE();
  for (const account of [perkManagerAddress, merchStoreAddress]) {
    await grantRoleIfMissing(
      fanFuelBank as unknown as Contract,
      spenderRole,
      account,
      deploymentTxOverrides,
    );
  }

  const minterRole = await collectibleNFT.MINTER_ROLE();
  await grantRoleIfMissing(
    collectibleNFT as unknown as Contract,
    minterRole,
    checkInRegistryAddress,
    deploymentTxOverrides,
  );

  const merchTwinMinterRole = await merchTwinNFT.MINTER_ROLE();
  await grantRoleIfMissing(
    merchTwinNFT as unknown as Contract,
    merchTwinMinterRole,
    merchStoreAddress,
    deploymentTxOverrides,
  );

  const insuranceOracleRole = await insurancePool.ORACLE_ROLE();
  await grantRoleIfMissing(
    insurancePool as unknown as Contract,
    insuranceOracleRole,
    weatherOracleAdapterAddress,
    deploymentTxOverrides,
  );

  const reporterRole = await weatherOracleAdapter.REPORTER_ROLE();
  for (const account of reporterAddresses) {
    await grantRoleIfMissing(
      weatherOracleAdapter as unknown as Contract,
      reporterRole,
      account,
      deploymentTxOverrides,
    );
  }

  const pauserRole = await ticket.PAUSER_ROLE();
  for (const account of pauserAddresses) {
    await grantRoleIfMissing(
      ticket as unknown as Contract,
      pauserRole,
      account,
      deploymentTxOverrides,
    );
  }

  const scannerAdminRole = await checkInRegistry.SCANNER_ADMIN_ROLE();
  for (const account of scannerAdminAddresses) {
    await grantRoleIfMissing(
      checkInRegistry as unknown as Contract,
      scannerAdminRole,
      account,
      deploymentTxOverrides,
    );
  }

  for (const scannerAddress of scannerAddresses) {
    const grantScannerTx = await checkInRegistry.grantScanner(
      scannerAddress,
      deploymentTxOverrides,
    );
    await grantScannerTx.wait();
    console.log(`Granted scanner ${scannerAddress}: ${explorerTxLink(grantScannerTx.hash)}`);
  }

  const buybackRole = await marketplace.BUYBACK_ROLE();
  for (const account of buybackOperatorAddresses) {
    await grantRoleIfMissing(
      marketplace as unknown as Contract,
      buybackRole,
      account,
      deploymentTxOverrides,
    );
  }

  if (insurancePoolSeed > 0n) {
    const seedTx = await deployer.sendTransaction({
      to: insurancePoolAddress,
      value: insurancePoolSeed,
      ...deploymentTxOverrides,
    });
    await seedTx.wait();
    console.log(`Seeded InsurancePool: ${explorerTxLink(seedTx.hash)}`);
  }

  const seededPerks = seedPerks ? buildSeededPerks(artistId) : [];
  if (seededPerks.length > 0) {
    await configureSeededPerks(
      perkManager as unknown as Contract,
      await ticket.artistKey(),
      seededPerks,
      deploymentTxOverrides,
    );
  }

  const seededSkus = seedMerch ? buildSeededSkus(artistId) : [];
  if (seededSkus.length > 0) {
    await configureSeededMerch(
      merchStore as unknown as Contract,
      seededSkus,
      deploymentTxOverrides,
    );
  }

  const weatherPolicy = await maybePublishWeatherDemo(
    weatherOracleAdapter as unknown as Contract,
    eventId,
    deploymentTxOverrides,
  );

  const deploymentBlock = await ethers.provider.getBlockNumber();
  if (chainTicketFactory && factoryAddress) {
    const registerEventTx = await chainTicketFactory.registerEvent({
      eventId,
      name,
      symbol,
      artistId,
      seriesId,
      primaryPrice,
      maxSupply,
      fanPassAllocationBps,
      artistRoyaltyBps,
      treasury,
      admin: deployer.address,
      ticketNFT: ticketAddress,
      marketplace: marketplaceAddress,
      checkInRegistry: checkInRegistryAddress,
      collectibleContract: collectibleAddress,
      fanScoreRegistry: fanScoreRegistryAddress,
      fanFuelBank: fanFuelBankAddress,
      insurancePool: insurancePoolAddress,
      oracleAdapter: weatherOracleAdapterAddress,
      merchStore: merchStoreAddress,
      perkManager: perkManagerAddress,
      deploymentBlock: BigInt(deploymentBlock),
    }, deploymentTxOverrides);
    await registerEventTx.wait();
    console.log(`Factory registration tx: ${explorerTxLink(registerEventTx.hash)}`);
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const manifest: DeploymentManifest = {
    productLine: "upgraded",
    network: network.name,
    chainId,
    eventId,
    eventName: name,
    eventSymbol: symbol,
    artistId,
    seriesId,
    deploymentBlock,
    deployedAt: new Date().toISOString(),
    primaryPriceWei: primaryPrice.toString(),
    insurancePremiumWei: insurancePremium.toString(),
    maxSupply: maxSupply.toString(),
    fanPassAllocationBps: fanPassAllocationBps.toString(),
    artistRoyaltyBps: artistRoyaltyBps.toString(),
    treasury,
    attestationSigner,
    addresses: {
      factoryAddress,
      ticketNftAddress: ticketAddress,
      marketplaceAddress,
      checkInRegistryAddress,
      collectibleAddress,
      fanScoreRegistryAddress,
      fanFuelBankAddress,
      insurancePoolAddress,
      oracleAdapterAddress: weatherOracleAdapterAddress,
      perkManagerAddress,
      merchTwinAddress,
      merchStoreAddress,
    },
    baseUris: {
      ticket: baseTokenURI,
      collectible: collectibleBaseURI,
      merch: merchBaseURI,
    },
    seeded: {
      perks: seededPerks,
      skus: seededSkus,
      weatherPolicy,
    },
  };

  writeManifest(manifestPath, manifest);
  if (path.resolve(manifestPath) !== path.resolve(latestManifestPath)) {
    writeManifest(latestManifestPath, manifest);
  }

  console.log("");
  console.log("Deployment summary");
  console.log(`TicketNFTV2: ${ticketAddress}`);
  console.log(`MarketplaceV2: ${marketplaceAddress}`);
  console.log(`CheckInRegistryV2: ${checkInRegistryAddress}`);
  console.log(`CollectibleNFT: ${collectibleAddress}`);
  console.log(`FanScoreRegistry: ${fanScoreRegistryAddress}`);
  console.log(`FanFuelBank: ${fanFuelBankAddress}`);
  console.log(`InsurancePool: ${insurancePoolAddress}`);
  console.log(`WeatherOracleAdapter: ${weatherOracleAdapterAddress}`);
  console.log(`PerkManager: ${perkManagerAddress}`);
  console.log(`MerchTwinNFT: ${merchTwinAddress}`);
  console.log(`MerchStore: ${merchStoreAddress}`);
  if (factoryAddress) {
    console.log(`ChainTicketFactoryV2: ${factoryAddress}`);
  }
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Current manifest: ${latestManifestPath}`);

  console.log("");
  console.log("Polygonscan links");
  console.log(`TicketNFTV2: ${explorerAddressLink(ticketAddress)}`);
  console.log(`MarketplaceV2: ${explorerAddressLink(marketplaceAddress)}`);
  console.log(`CheckInRegistryV2: ${explorerAddressLink(checkInRegistryAddress)}`);
  console.log(`CollectibleNFT: ${explorerAddressLink(collectibleAddress)}`);
  console.log(`FanScoreRegistry: ${explorerAddressLink(fanScoreRegistryAddress)}`);
  console.log(`FanFuelBank: ${explorerAddressLink(fanFuelBankAddress)}`);
  console.log(`InsurancePool: ${explorerAddressLink(insurancePoolAddress)}`);
  console.log(`WeatherOracleAdapter: ${explorerAddressLink(weatherOracleAdapterAddress)}`);
  console.log(`PerkManager: ${explorerAddressLink(perkManagerAddress)}`);
  console.log(`MerchTwinNFT: ${explorerAddressLink(merchTwinAddress)}`);
  console.log(`MerchStore: ${explorerAddressLink(merchStoreAddress)}`);
  if (factoryAddress) {
    console.log(`ChainTicketFactoryV2: ${explorerAddressLink(factoryAddress)}`);
  }

  console.log("");
  console.log("Seeded business rails");
  console.log(`Perks: ${seededPerks.map((perk) => perk.id).join(", ") || "none"}`);
  console.log(`Merch SKUs: ${seededSkus.map((sku) => sku.id).join(", ") || "none"}`);
  console.log(
    `Weather demo: ${
      weatherPolicy ? `round ${weatherPolicy.roundId} @ ${weatherPolicy.payoutBps} bps` : "inactive"
    }`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
