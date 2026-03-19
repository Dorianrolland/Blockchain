import { network } from "hardhat";

const { ethers } = await network.connect();

const fanPassAttestationTypes = {
  FanPassAttestation: [
    { name: "buyer", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
};

async function signFanPassAttestation(
  ticket: { name: () => Promise<string>; getAddress: () => Promise<string> },
  signer: { signTypedData: (domain: unknown, types: unknown, value: unknown) => Promise<string> },
  buyer: string,
  deadline: bigint,
) {
  const [name, verifyingContract, networkInfo] = await Promise.all([
    ticket.name(),
    ticket.getAddress(),
    ethers.provider.getNetwork(),
  ]);

  return signer.signTypedData(
    {
      name,
      version: "2",
      chainId: networkInfo.chainId,
      verifyingContract,
    },
    fanPassAttestationTypes,
    { buyer, deadline },
  );
}

async function deployLocalUpgrade() {
  const [admin, treasury, attestor, fanA, fanB, fanC, scanner] = await ethers.getSigners();

  const primaryPrice = ethers.parseEther("0.1");
  const insurancePremium = ethers.parseEther("0.02");
  const artistId = "chainticket-demo-artist";
  const seriesId = "founders-tour-2026";
  const artistKey = ethers.keccak256(ethers.toUtf8Bytes(artistId));

  const fanScore = await (
    await ethers.getContractFactory("FanScoreRegistry", admin)
  ).deploy(admin.address);
  await fanScore.waitForDeployment();

  const fanFuel = await (
    await ethers.getContractFactory("FanFuelBank", admin)
  ).deploy(admin.address);
  await fanFuel.waitForDeployment();

  const collectible = await (
    await ethers.getContractFactory("CollectibleNFT", admin)
  ).deploy(
    "ChainTicket Collectible",
    "CTCOLL",
    artistId,
    "ipfs://chainticket/collectibles/",
    await fanScore.getAddress(),
    admin.address,
  );
  await collectible.waitForDeployment();

  const ticket = await (
    await ethers.getContractFactory("TicketNFTV2", admin)
  ).deploy(
    "ChainTicket Event",
    "CTK",
    artistId,
    seriesId,
    primaryPrice,
    insurancePremium,
    100n,
    3000n,
    500n,
    treasury.address,
    "ipfs://chainticket/tickets/",
    attestor.address,
    await fanScore.getAddress(),
    await fanFuel.getAddress(),
    admin.address,
  );
  await ticket.waitForDeployment();

  const insurancePool = await (
    await ethers.getContractFactory("InsurancePool", admin)
  ).deploy(await ticket.getAddress(), admin.address);
  await insurancePool.waitForDeployment();

  const oracleAdapter = await (
    await ethers.getContractFactory("WeatherOracleAdapter", admin)
  ).deploy(await insurancePool.getAddress(), admin.address);
  await oracleAdapter.waitForDeployment();

  const marketplace = await (
    await ethers.getContractFactory("MarketplaceV2", admin)
  ).deploy(
    await ticket.getAddress(),
    treasury.address,
    500n,
    artistKey,
    await fanScore.getAddress(),
    await fanFuel.getAddress(),
    admin.address,
  );
  await marketplace.waitForDeployment();

  const checkInRegistry = await (
    await ethers.getContractFactory("CheckInRegistryV2", admin)
  ).deploy(
    await ticket.getAddress(),
    await collectible.getAddress(),
    await fanScore.getAddress(),
    await fanFuel.getAddress(),
    artistKey,
    admin.address,
  );
  await checkInRegistry.waitForDeployment();

  const merchTwin = await (
    await ethers.getContractFactory("MerchTwinNFT", admin)
  ).deploy("ChainTicket Merch Twin", "CTMERCH", "ipfs://chainticket/merch/", admin.address);
  await merchTwin.waitForDeployment();

  const merchStore = await (
    await ethers.getContractFactory("MerchStore", admin)
  ).deploy(await fanFuel.getAddress(), await merchTwin.getAddress(), admin.address);
  await merchStore.waitForDeployment();

  const perkManager = await (
    await ethers.getContractFactory("PerkManager", admin)
  ).deploy(await fanScore.getAddress(), await fanFuel.getAddress(), admin.address);
  await perkManager.waitForDeployment();

  await (await ticket.setMarketplace(await marketplace.getAddress())).wait();
  await (await ticket.setCheckInRegistry(await checkInRegistry.getAddress())).wait();
  await (await ticket.setInsurancePool(await insurancePool.getAddress())).wait();
  await (
    await ticket.setBaseUris(
      "ipfs://chainticket/tickets/",
      "ipfs://chainticket/collectibles/",
    )
  ).wait();

  const sourceRole = await fanScore.SOURCE_ROLE();
  await (await fanScore.grantRole(sourceRole, await ticket.getAddress())).wait();
  await (await fanScore.grantRole(sourceRole, await marketplace.getAddress())).wait();
  await (await fanScore.grantRole(sourceRole, await checkInRegistry.getAddress())).wait();

  const rewarderRole = await fanFuel.REWARDER_ROLE();
  await (await fanFuel.grantRole(rewarderRole, await ticket.getAddress())).wait();
  await (await fanFuel.grantRole(rewarderRole, await marketplace.getAddress())).wait();
  await (await fanFuel.grantRole(rewarderRole, await checkInRegistry.getAddress())).wait();

  const spenderRole = await fanFuel.SPENDER_ROLE();
  await (await fanFuel.grantRole(spenderRole, await perkManager.getAddress())).wait();
  await (await fanFuel.grantRole(spenderRole, await merchStore.getAddress())).wait();

  const collectibleMinterRole = await collectible.MINTER_ROLE();
  await (
    await collectible.grantRole(collectibleMinterRole, await checkInRegistry.getAddress())
  ).wait();

  const merchTwinMinterRole = await merchTwin.MINTER_ROLE();
  await (await merchTwin.grantRole(merchTwinMinterRole, await merchStore.getAddress())).wait();

  const oracleRole = await insurancePool.ORACLE_ROLE();
  await (await insurancePool.grantRole(oracleRole, await oracleAdapter.getAddress())).wait();

  await (await checkInRegistry.grantScanner(scanner.address)).wait();

  await (
    await perkManager.configurePerk(
      ethers.keccak256(ethers.toUtf8Bytes(`${artistId}:backstage`)),
      artistKey,
      30n,
      1n,
      5n,
      "ipfs://chainticket/perks/backstage.json",
      true,
    )
  ).wait();

  await (
    await merchStore.configureSku(
      `${artistId}-tee-black-limited`,
      5n,
      25n,
      true,
    )
  ).wait();

  return {
    admin,
    treasury,
    attestor,
    fanA,
    fanB,
    fanC,
    scanner,
    primaryPrice,
    insurancePremium,
    artistId,
    artistKey,
    fanScore,
    fanFuel,
    ticket,
    insurancePool,
    oracleAdapter,
    collectible,
    marketplace,
    checkInRegistry,
    merchTwin,
    merchStore,
    perkManager,
  };
}

async function main(): Promise<void> {
  const system = await deployLocalUpgrade();
  const {
    admin,
    fanA,
    fanB,
    fanC,
    scanner,
    attestor,
    primaryPrice,
    insurancePremium,
    artistId,
    fanScore,
    fanFuel,
    ticket,
    insurancePool,
    oracleAdapter,
    collectible,
    marketplace,
    checkInRegistry,
    merchStore,
    perkManager,
  } = system;

  console.log("ChainTicket Local Full-Stack Demo");
  console.log(`TicketNFTV2: ${await ticket.getAddress()}`);
  console.log(`MarketplaceV2: ${await marketplace.getAddress()}`);
  console.log(`CheckInRegistryV2: ${await checkInRegistry.getAddress()}`);
  console.log(`InsurancePool: ${await insurancePool.getAddress()}`);
  console.log(`CollectibleNFT: ${await collectible.getAddress()}`);
  console.log(`PerkManager: ${await perkManager.getAddress()}`);
  console.log(`MerchStore: ${await merchStore.getAddress()}`);
  console.log("");

  await (
    await ticket.connect(fanA).mintStandard(true, {
      value: primaryPrice + insurancePremium,
    })
  ).wait();
  console.log("1) Fan A minted an insured standard ticket");

  const fanPassDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const fanPassSignature = await signFanPassAttestation(
    ticket,
    attestor,
    fanB.address,
    fanPassDeadline,
  );
  await (
    await ticket.connect(fanB).mintFanPass(fanPassSignature, false, fanPassDeadline, {
      value: primaryPrice,
    })
  ).wait();
  console.log("2) Fan B minted a protected FanPass");

  await (await ticket.connect(fanA).approve(await marketplace.getAddress(), 0n)).wait();
  await (await marketplace.connect(fanA).list(0n, primaryPrice)).wait();
  await (await marketplace.connect(fanC).buy(0n, { value: primaryPrice })).wait();
  console.log("3) Standard ticket was resold with capped price and artist royalty");

  await (await ticket.connect(fanB).approve(await marketplace.getAddress(), 1n)).wait();
  await (await marketplace.connect(admin).organizerBuyback(1n, { value: primaryPrice })).wait();
  console.log("4) Organizer buyback reclaimed the FanPass at primary price");

  await admin.sendTransaction({
    to: await insurancePool.getAddress(),
    value: primaryPrice,
  });
  await (
    await oracleAdapter.publishWeatherOutcome(
      1n,
      10_000,
      ethers.keccak256(ethers.toUtf8Bytes("weather-demo:red")),
    )
  ).wait();
  await (await insurancePool.connect(fanC).claim(0n)).wait();
  console.log("5) Weather oracle opened the policy and Fan C claimed insurance");

  await (await checkInRegistry.connect(scanner).checkInAndTransform(0n, fanC.address)).wait();
  console.log("6) Scanner consumed the ticket and minted the collectible souvenir");

  await (
    await perkManager
      .connect(fanC)
      .redeemPerk(ethers.keccak256(ethers.toUtf8Bytes(`${artistId}:backstage`)))
  ).wait();
  console.log("7) Fan C redeemed a score-gated perk using Fan-Fuel");

  await (
    await merchStore.connect(fanC).redeem(`${artistId}-tee-black-limited`)
  ).wait();
  console.log("8) Fan C redeemed phygital merch and received a twin NFT");

  console.log("");
  console.log("Fan rail summary");
  console.log(`Fan C reputation: ${await fanScore.reputationOf(fanC.address)}`);
  console.log(`Fan C Fan-Fuel: ${await fanFuel.balanceOf(fanC.address)}`);
  console.log(`Fan C attendance count: ${await fanScore.artistAttendanceOf(fanC.address, await ticket.artistKey())}`);
  console.log(`Collectible owner(0): ${await collectible.ownerOf(0n)}`);
  console.log(`Merch twin owner(0): ${await system.merchTwin.ownerOf(0n)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
