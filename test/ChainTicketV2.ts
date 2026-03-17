import { expect } from "chai";
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
  signer: {
    signTypedData: (
      domain: {
        name: string;
        version: string;
        chainId: bigint;
        verifyingContract: string;
      },
      types: typeof fanPassAttestationTypes,
      value: { buyer: string; deadline: bigint },
    ) => Promise<string>;
  },
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
    {
      buyer,
      deadline,
    },
  );
}

async function deployAdvancedSystem(options?: {
  maxSupply?: bigint;
  fanPassAllocationBps?: bigint;
  artistId?: string;
  seriesId?: string;
  sharedFanScore?: { getAddress: () => Promise<string> } | null;
  sharedFanFuel?: { getAddress: () => Promise<string> } | null;
}) {
  const [admin, treasury, attestor, seller, buyer, other, scanner, extra] =
    await ethers.getSigners();

  const primaryPrice = ethers.parseEther("0.1");
  const insurancePremium = ethers.parseEther("0.02");
  const maxSupply = options?.maxSupply ?? 10n;
  const fanPassAllocationBps = options?.fanPassAllocationBps ?? 3000n;
  const artistId = options?.artistId ?? "artist-alpha";
  const seriesId = options?.seriesId ?? "tour-2027";

  const fanScore =
    options?.sharedFanScore ??
    (await (await ethers.getContractFactory("FanScoreRegistry", admin)).deploy(admin.address));
  await fanScore.waitForDeployment();

  const fanFuel =
    options?.sharedFanFuel ??
    (await (await ethers.getContractFactory("FanFuelBank", admin)).deploy(admin.address));
  await fanFuel.waitForDeployment();

  const fanScoreAddress = await fanScore.getAddress();
  const fanFuelAddress = await fanFuel.getAddress();
  const artistKey = ethers.keccak256(ethers.toUtf8Bytes(artistId));

  const ticket = await (
    await ethers.getContractFactory("TicketNFTV2", admin)
  ).deploy(
    "ChainTicket Advanced",
    "CTV2",
    artistId,
    seriesId,
    primaryPrice,
    insurancePremium,
    maxSupply,
    fanPassAllocationBps,
    500n,
    treasury.address,
    "ipfs://tickets/",
    attestor.address,
    fanScoreAddress,
    fanFuelAddress,
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

  const collectible = await (
    await ethers.getContractFactory("CollectibleNFT", admin)
  ).deploy(
    "ChainTicket Collectible",
    "CTCOLL",
    artistId,
    "ipfs://collectibles/",
    fanScoreAddress,
    admin.address,
  );
  await collectible.waitForDeployment();

  const marketplace = await (
    await ethers.getContractFactory("MarketplaceV2", admin)
  ).deploy(
    await ticket.getAddress(),
    treasury.address,
    500n,
    artistKey,
    fanScoreAddress,
    fanFuelAddress,
    admin.address,
  );
  await marketplace.waitForDeployment();

  const checkInRegistry = await (
    await ethers.getContractFactory("CheckInRegistryV2", admin)
  ).deploy(
    await ticket.getAddress(),
    await collectible.getAddress(),
    fanScoreAddress,
    fanFuelAddress,
    artistKey,
    admin.address,
  );
  await checkInRegistry.waitForDeployment();

  const merchTwin = await (
    await ethers.getContractFactory("MerchTwinNFT", admin)
  ).deploy("ChainTicket Merch Twin", "CTMT", "ipfs://merch/", admin.address);
  await merchTwin.waitForDeployment();

  const merchStore = await (
    await ethers.getContractFactory("MerchStore", admin)
  ).deploy(fanFuelAddress, await merchTwin.getAddress(), admin.address);
  await merchStore.waitForDeployment();

  const perkManager = await (
    await ethers.getContractFactory("PerkManager", admin)
  ).deploy(fanScoreAddress, fanFuelAddress, admin.address);
  await perkManager.waitForDeployment();

  await (await ticket.setInsurancePool(await insurancePool.getAddress())).wait();
  await (await ticket.setMarketplace(await marketplace.getAddress())).wait();
  await (await ticket.setCheckInRegistry(await checkInRegistry.getAddress())).wait();
  await (await ticket.setBaseUris("ipfs://tickets/", "ipfs://collectibles/")).wait();

  const sourceRole = await fanScore.SOURCE_ROLE();
  await (await fanScore.grantRole(sourceRole, await ticket.getAddress())).wait();
  await (await fanScore.grantRole(sourceRole, await marketplace.getAddress())).wait();
  await (await fanScore.grantRole(sourceRole, await checkInRegistry.getAddress())).wait();

  const rewarderRole = await fanFuel.REWARDER_ROLE();
  const spenderRole = await fanFuel.SPENDER_ROLE();
  await (await fanFuel.grantRole(rewarderRole, await ticket.getAddress())).wait();
  await (await fanFuel.grantRole(rewarderRole, await marketplace.getAddress())).wait();
  await (await fanFuel.grantRole(rewarderRole, await checkInRegistry.getAddress())).wait();
  await (await fanFuel.grantRole(spenderRole, await merchStore.getAddress())).wait();
  await (await fanFuel.grantRole(spenderRole, await perkManager.getAddress())).wait();

  const collectibleMinterRole = await collectible.MINTER_ROLE();
  await (await collectible.grantRole(collectibleMinterRole, await checkInRegistry.getAddress())).wait();

  const merchTwinMinterRole = await merchTwin.MINTER_ROLE();
  await (await merchTwin.grantRole(merchTwinMinterRole, await merchStore.getAddress())).wait();

  const oracleRole = await insurancePool.ORACLE_ROLE();
  await (await insurancePool.grantRole(oracleRole, await oracleAdapter.getAddress())).wait();

  await (await checkInRegistry.grantScanner(scanner.address)).wait();

  return {
    admin,
    treasury,
    attestor,
    seller,
    buyer,
    other,
    scanner,
    extra,
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

describe("ChainTicket V2", function () {
  it("keeps canonical ticket compatibility surfaces on the upgraded stack", async function () {
    const { admin, seller, ticket, primaryPrice } = await deployAdvancedSystem();

    await expect(ticket.connect(seller).mintPrimary({ value: primaryPrice }))
      .to.emit(ticket, "PrimaryMinted")
      .withArgs(seller.address, 0n, primaryPrice);

    expect(await ticket.collectibleMode()).to.equal(false);
    expect(await ticket.baseUris()).to.deep.equal(["ipfs://tickets/", "ipfs://collectibles/"]);

    await expect(ticket.connect(admin).setCollectibleMode(true))
      .to.emit(ticket, "CollectibleModeUpdated")
      .withArgs(true);
    expect(await ticket.collectibleMode()).to.equal(true);

    await expect(ticket.connect(admin).setBaseUris("ipfs://tickets-v2/", "ipfs://collectibles-v2/"))
      .to.emit(ticket, "BaseUrisUpdated")
      .withArgs("ipfs://tickets-v2/", "ipfs://collectibles-v2/");
    expect(await ticket.baseUris()).to.deep.equal([
      "ipfs://tickets-v2/",
      "ipfs://collectibles-v2/",
    ]);
  });

  it("reserves FanPass inventory and requires a valid attestation", async function () {
    const system = await deployAdvancedSystem({
      maxSupply: 4n,
      fanPassAllocationBps: 2500n,
    });
    const { seller, buyer, other, scanner, extra, ticket, attestor, primaryPrice } = system;

    await (await ticket.connect(seller).mintStandard(false, { value: primaryPrice })).wait();
    await (await ticket.connect(buyer).mintStandard(false, { value: primaryPrice })).wait();
    await (await ticket.connect(other).mintStandard(false, { value: primaryPrice })).wait();

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const validSignature = await signFanPassAttestation(
      ticket,
      attestor,
      extra.address,
      deadline,
    );

    await expect(
      ticket.connect(scanner).mintFanPass(validSignature, false, deadline, { value: primaryPrice }),
    ).to.be.revertedWithCustomError(ticket, "InvalidAttestationSigner");

    await expect(
      ticket.connect(scanner).mintStandard(false, { value: primaryPrice }),
    ).to.be.revertedWith("Standard allocation exhausted");

    await expect(
      ticket.connect(extra).mintFanPass(validSignature, false, deadline, { value: primaryPrice }),
    )
      .to.emit(ticket, "FanPassMinted")
      .withArgs(extra.address, 3n, false);

    expect(await ticket.ticketClassOf(3n)).to.equal(1n);
    expect(await ticket.fanPassMinted()).to.equal(1n);
  });

  it("routes artist royalties on resale and restricts FanPass tickets to organizer buyback", async function () {
    const system = await deployAdvancedSystem();
    const { admin, seller, buyer, other, treasury, attestor, ticket, marketplace, fanScore, fanFuel, primaryPrice } =
      system;

    await (await ticket.connect(seller).mintStandard(false, { value: primaryPrice })).wait();
    await (await ticket.connect(seller).approve(await marketplace.getAddress(), 0n)).wait();
    await (await marketplace.connect(seller).list(0n, primaryPrice)).wait();

    const sellerBefore = await ethers.provider.getBalance(seller.address);
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);

    await expect(marketplace.connect(buyer).buy(0n, { value: primaryPrice }))
      .to.emit(marketplace, "Sold")
      .withArgs(0n, seller.address, buyer.address, primaryPrice, (primaryPrice * 500n) / 10_000n);

    const sellerAfter = await ethers.provider.getBalance(seller.address);
    const treasuryAfter = await ethers.provider.getBalance(treasury.address);
    const royaltyAmount = (primaryPrice * 500n) / 10_000n;

    expect(sellerAfter - sellerBefore).to.equal(primaryPrice - royaltyAmount);
    expect(treasuryAfter - treasuryBefore).to.equal(royaltyAmount);
    expect(await fanScore.reputationOf(buyer.address)).to.equal(3n);
    expect(await fanFuel.balanceOf(buyer.address)).to.equal(2n);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const fanPassSignature = await signFanPassAttestation(ticket, attestor, other.address, deadline);
    await (
      await ticket.connect(other).mintFanPass(fanPassSignature, false, deadline, { value: primaryPrice })
    ).wait();

    await (await ticket.connect(other).approve(await marketplace.getAddress(), 1n)).wait();
    await expect(
      marketplace.connect(other).list(1n, primaryPrice),
    ).to.be.revertedWith("FanPass cannot be listed");

    const otherBefore = await ethers.provider.getBalance(other.address);
    await expect(
      marketplace.connect(admin).organizerBuyback(1n, { value: primaryPrice }),
    )
      .to.emit(marketplace, "Buyback")
      .withArgs(1n, other.address, admin.address, primaryPrice);
    const otherAfter = await ethers.provider.getBalance(other.address);

    expect(otherAfter - otherBefore).to.equal(primaryPrice);
    expect(await ticket.ownerOf(1n)).to.equal(treasury.address);
    expect(await fanScore.reputationOf(other.address)).to.equal(32n);
    expect(await fanFuel.balanceOf(other.address)).to.equal(18n);
  });

  it("activates insurance payouts and prevents double claims", async function () {
    const system = await deployAdvancedSystem();
    const { admin, seller, buyer, ticket, insurancePool, oracleAdapter, primaryPrice, insurancePremium } =
      system;

    await (
      await ticket.connect(seller).mintStandard(true, {
        value: primaryPrice + insurancePremium,
      })
    ).wait();

    await admin.sendTransaction({
      to: await insurancePool.getAddress(),
      value: primaryPrice,
    });

    const reportHash = ethers.keccak256(ethers.toUtf8Bytes("weather:red"));
    await (await oracleAdapter.publishWeatherOutcome(1n, 10_000, reportHash)).wait();

    const coverage = await ticket.coverageOf(0n);
    expect(coverage[0]).to.equal(true);
    expect(coverage[2]).to.equal(true);
    expect(coverage[6]).to.equal(primaryPrice);

    await expect(insurancePool.connect(buyer).claim(0n)).to.be.revertedWith(
      "Only ticket owner can claim",
    );

    await expect(insurancePool.connect(seller).claim(0n))
      .to.emit(insurancePool, "CoverageClaimed")
      .withArgs(0n, seller.address, primaryPrice, 1n);

    expect(await ticket.coverageClaimed(0n)).to.equal(true);

    await expect(insurancePool.connect(seller).claim(0n)).to.be.revertedWith(
      "Coverage already claimed",
    );
  });

  it("burns checked-in tickets into collectibles and levels them up across events of the same artist", async function () {
    const sharedScore = await (
      await ethers.getContractFactory("FanScoreRegistry")
    ).deploy((await ethers.getSigners())[0].address);
    await sharedScore.waitForDeployment();

    const sharedFuel = await (
      await ethers.getContractFactory("FanFuelBank")
    ).deploy((await ethers.getSigners())[0].address);
    await sharedFuel.waitForDeployment();

    const first = await deployAdvancedSystem({
      artistId: "artist-shared",
      sharedFanScore: sharedScore,
      sharedFanFuel: sharedFuel,
    });
    const second = await deployAdvancedSystem({
      artistId: "artist-shared",
      seriesId: "tour-2028",
      sharedFanScore: sharedScore,
      sharedFanFuel: sharedFuel,
    });

    await (await first.ticket.connect(first.seller).mintStandard(false, { value: first.primaryPrice })).wait();
    await expect(
      first.checkInRegistry.connect(first.scanner).checkInAndTransform(0n, first.seller.address),
    )
      .to.emit(first.checkInRegistry, "TicketCheckedInAndTransformed")
      .withArgs(0n, 0n, first.seller.address, first.scanner.address);

    expect(await first.collectible.ownerOf(0n)).to.equal(first.seller.address);
    expect(await first.collectible.levelOf(0n)).to.equal(1n);

    await expect(first.ticket.ownerOf(0n)).to.be.revertedWithCustomError(
      first.ticket,
      "ERC721NonexistentToken",
    );

    await (await second.ticket.connect(second.seller).mintStandard(false, { value: second.primaryPrice })).wait();
    await (await second.checkInRegistry.connect(second.scanner).checkInAndTransform(0n, second.seller.address)).wait();

    expect(await first.collectible.levelOf(0n)).to.equal(2n);
    expect(await second.collectible.levelOf(0n)).to.equal(2n);
  });

  it("unlocks perks and redeems phygital merch with non-transferable FanFuel", async function () {
    const system = await deployAdvancedSystem();
    const { seller, scanner, ticket, checkInRegistry, fanFuel, perkManager, merchStore, merchTwin, primaryPrice } =
      system;

    await (await ticket.connect(seller).mintStandard(false, { value: primaryPrice })).wait();
    await (await checkInRegistry.connect(scanner).checkInAndTransform(0n, seller.address)).wait();

    const perkId = ethers.keccak256(ethers.toUtf8Bytes("BACKSTAGE"));
    await (
      await perkManager.configurePerk(
        perkId,
        system.artistKey,
        50n,
        1n,
        10n,
        "ipfs://perks/backstage.json",
        true,
      )
    ).wait();

    expect(await perkManager.canAccess(seller.address, perkId)).to.equal(true);
    expect(await fanFuel.balanceOf(seller.address)).to.equal(20n);

    await expect(perkManager.connect(seller).redeemPerk(perkId))
      .to.emit(perkManager, "PerkRedeemed")
      .withArgs(perkId, seller.address, 10n);

    expect(await fanFuel.balanceOf(seller.address)).to.equal(10n);

    await (await merchStore.configureSku("vinyl-drop", 5n, 3n, true)).wait();
    await expect(merchStore.connect(seller).redeem("vinyl-drop"))
      .to.emit(merchStore, "Redeemed")
      .withArgs(
        ethers.keccak256(ethers.toUtf8Bytes("vinyl-drop")),
        "vinyl-drop",
        seller.address,
        0n,
        5n,
      );

    expect(await merchTwin.ownerOf(0n)).to.equal(seller.address);
    expect(await fanFuel.balanceOf(seller.address)).to.equal(5n);
  });

  it("registers extended V2 event deployments", async function () {
    const system = await deployAdvancedSystem();
    const {
      admin,
      ticket,
      marketplace,
      checkInRegistry,
      collectible,
      fanScore,
      fanFuel,
      insurancePool,
      oracleAdapter,
      merchStore,
      perkManager,
      primaryPrice,
    } = system;

    const factory = await (
      await ethers.getContractFactory("ChainTicketFactoryV2", admin)
    ).deploy(admin.address);
    await factory.waitForDeployment();

    const deploymentBlock = await ethers.provider.getBlockNumber();

    await (
      await factory.registerEvent({
        eventId: "artist-alpha-paris-2027",
        name: "Paris Live",
        symbol: "PARIS27",
        artistId: "artist-alpha",
        seriesId: "tour-2027",
        primaryPrice,
        maxSupply: 10n,
        fanPassAllocationBps: 3000n,
        artistRoyaltyBps: 500n,
        treasury: system.treasury.address,
        admin: admin.address,
        ticketNFT: await ticket.getAddress(),
        marketplace: await marketplace.getAddress(),
        checkInRegistry: await checkInRegistry.getAddress(),
        collectibleContract: await collectible.getAddress(),
        fanScoreRegistry: await fanScore.getAddress(),
        fanFuelBank: await fanFuel.getAddress(),
        insurancePool: await insurancePool.getAddress(),
        oracleAdapter: await oracleAdapter.getAddress(),
        merchStore: await merchStore.getAddress(),
        perkManager: await perkManager.getAddress(),
        deploymentBlock: BigInt(deploymentBlock),
      })
    ).wait();

    const deployment = await factory.getEventById("artist-alpha-paris-2027");
    expect(deployment.artistId).to.equal("artist-alpha");
    expect(deployment.seriesId).to.equal("tour-2027");
    expect(deployment.fanPassAllocationBps).to.equal(3000n);
    expect(deployment.artistRoyaltyBps).to.equal(500n);
    expect(deployment.ticketNFT).to.equal(await ticket.getAddress());
    expect(deployment.perkManager).to.equal(await perkManager.getAddress());
    expect(await factory.totalEvents()).to.equal(1n);
  });
});
