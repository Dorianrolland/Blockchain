import { parseEther } from "ethers";
import { describe, expect, it, vi } from "vitest";

import { createChainTicketClientFromBindings } from "./chainTicketClient";
import type { ContractConfig, PreflightAction } from "../types/chainticket";

const config: ContractConfig = {
  chainId: 80002,
  chainName: "Polygon Amoy",
  rpcUrl: "https://rpc-amoy.polygon.technology",
  explorerTxBaseUrl: "https://amoy.polygonscan.com/tx/",
  deploymentBlock: 0,
  ticketNftAddress: "0x0000000000000000000000000000000000000011",
  marketplaceAddress: "0x0000000000000000000000000000000000000022",
  checkInRegistryAddress: "0x0000000000000000000000000000000000000033",
};
const v2Config: ContractConfig = {
  ...config,
  version: "v2",
  fanFuelBankAddress: "0x0000000000000000000000000000000000000055",
  perkManagerAddress: "0x0000000000000000000000000000000000000056",
  merchStoreAddress: "0x0000000000000000000000000000000000000066",
  insurancePoolAddress: "0x0000000000000000000000000000000000000044",
};

function fakeTx(hash: string) {
  return {
    hash,
    wait: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBaseBindings() {
  return {
    getSignerAddress: vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000BB"),
    hasSigner: vi.fn().mockReturnValue(true),
    getBlockTimestamp: vi.fn().mockResolvedValue(null),
    subscribeEvents: vi.fn().mockReturnValue(() => undefined),
    ticket: {
      hasRole: vi.fn().mockResolvedValue(false),
      primaryPrice: vi.fn().mockResolvedValue(parseEther("0.1")),
      insurancePremium: vi.fn().mockResolvedValue(parseEther("0.01")),
      maxSupply: vi.fn().mockResolvedValue(100n),
      totalMinted: vi.fn().mockResolvedValue(3n),
      maxPerWallet: vi.fn().mockResolvedValue(2n),
      fanPassSupplyCap: vi.fn().mockResolvedValue(30n),
      fanPassMinted: vi.fn().mockResolvedValue(1n),
      ticketClassOf: vi.fn().mockResolvedValue(0),
      paused: vi.fn().mockResolvedValue(false),
      collectibleMode: vi.fn().mockResolvedValue(false),
      baseUris: vi.fn().mockResolvedValue({
        baseTokenURI: "ipfs://ticket/base/",
        collectibleBaseURI: "ipfs://ticket/collectible/",
      }),
      coverageOf: vi.fn().mockResolvedValue({
        insured: true,
        claimed: false,
        claimable: true,
        payoutBps: 5000,
        weatherRoundId: 77n,
        premiumPaid: parseEther("0.01"),
        payoutAmount: parseEther("0.05"),
      }),
      isUsed: vi.fn().mockResolvedValue(false),
      tokenURI: vi.fn().mockImplementation(async (tokenId: bigint) => `ipfs://ticket/${tokenId}.json`),
      ownerOf: vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000BB"),
      balanceOf: vi.fn().mockResolvedValue(1n),
      getApproved: vi.fn().mockResolvedValue(config.marketplaceAddress),
      isApprovedForAll: vi.fn().mockResolvedValue(false),
      mintPrimary: vi.fn().mockResolvedValue(fakeTx("0xmint")),
      mintStandard: vi.fn().mockResolvedValue(fakeTx("0xmint-standard")),
      mintFanPass: vi.fn().mockResolvedValue(fakeTx("0xmint-fanpass")),
      approve: vi.fn().mockResolvedValue(fakeTx("0xapprove")),
      simulateMint: vi.fn().mockResolvedValue(undefined),
      estimateMintGas: vi.fn().mockResolvedValue(12345n),
      simulateMintStandard: vi.fn().mockResolvedValue(undefined),
      estimateMintStandardGas: vi.fn().mockResolvedValue(23456n),
      simulateMintFanPass: vi.fn().mockResolvedValue(undefined),
      estimateMintFanPassGas: vi.fn().mockResolvedValue(34567n),
      simulateApprove: vi.fn().mockResolvedValue(undefined),
      estimateApproveGas: vi.fn().mockResolvedValue(45678n),
      queryTransferEvents: vi.fn().mockResolvedValue([]),
      queryTransferEventsByToken: vi.fn().mockResolvedValue([]),
      queryCollectibleModeEvents: vi.fn().mockResolvedValue([]),
    },
    marketplace: {
      hasRole: vi.fn().mockResolvedValue(false),
      list: vi.fn().mockResolvedValue(fakeTx("0xlist")),
      listWithPermit: vi.fn().mockResolvedValue(fakeTx("0xlist-permit")),
      cancel: vi.fn().mockResolvedValue(fakeTx("0xcancel")),
      buy: vi.fn().mockResolvedValue(fakeTx("0xbuy")),
      organizerBuyback: vi.fn().mockResolvedValue(fakeTx("0xbuyback")),
      getListing: vi.fn().mockResolvedValue({
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.09"),
      }),
      simulateList: vi.fn().mockResolvedValue(undefined),
      estimateListGas: vi.fn().mockResolvedValue(34567n),
      simulateCancel: vi.fn().mockResolvedValue(undefined),
      estimateCancelGas: vi.fn().mockResolvedValue(45678n),
      simulateBuy: vi.fn().mockResolvedValue(undefined),
      estimateBuyGas: vi.fn().mockResolvedValue(56789n),
      simulateOrganizerBuyback: vi.fn().mockResolvedValue(undefined),
      estimateOrganizerBuybackGas: vi.fn().mockResolvedValue(67890n),
      queryListedEvents: vi.fn().mockResolvedValue([]),
      queryCancelledEvents: vi.fn().mockResolvedValue([]),
      querySoldEvents: vi.fn().mockResolvedValue([]),
    },
    fanFuelBank: {
      balanceOf: vi.fn().mockResolvedValue(40n),
    },
    perkManager: {
      perkOf: vi.fn().mockResolvedValue({
        artistKey: "0xartist",
        minScore: 20n,
        minAttendances: 1n,
        fuelCost: 10n,
        active: true,
        metadataURI: "ipfs://perks/backstage.json",
      }),
      canAccess: vi.fn().mockResolvedValue(true),
      redeemPerk: vi.fn().mockResolvedValue(fakeTx("0xredeem-perk")),
      simulateRedeemPerk: vi.fn().mockResolvedValue(undefined),
      estimateRedeemPerkGas: vi.fn().mockResolvedValue(43333n),
    },
    merchStore: {
      getSku: vi.fn().mockResolvedValue({
        skuId: "tee-black-l",
        price: 15n,
        stock: 4n,
        active: true,
      }),
      redeem: vi.fn().mockResolvedValue(fakeTx("0xredeem-merch")),
      simulateRedeem: vi.fn().mockResolvedValue(undefined),
      estimateRedeemGas: vi.fn().mockResolvedValue(44444n),
    },
    insurancePool: {
      claim: vi.fn().mockResolvedValue(fakeTx("0xclaim-insurance")),
      simulateClaim: vi.fn().mockResolvedValue(undefined),
      estimateClaimGas: vi.fn().mockResolvedValue(33333n),
    },
    checkInRegistry: {
      hasRole: vi.fn().mockResolvedValue(false),
      isUsed: vi.fn().mockResolvedValue(false),
      markUsed: vi.fn().mockResolvedValue(fakeTx("0xmark-used")),
      checkInAndTransform: vi.fn().mockResolvedValue(fakeTx("0xcheckin-transform")),
      simulateMarkUsed: vi.fn().mockResolvedValue(undefined),
      estimateMarkUsedGas: vi.fn().mockResolvedValue(11111n),
      simulateCheckInAndTransform: vi.fn().mockResolvedValue(undefined),
      estimateCheckInAndTransformGas: vi.fn().mockResolvedValue(22222n),
      queryUsedEvents: vi.fn().mockResolvedValue([]),
    },
  };
}

describe("chainTicketClient", () => {
  it("builds wallet tickets from transfer history", async () => {
    const bindings = makeBaseBindings();

    bindings.ticket.ownerOf = vi.fn().mockImplementation(async (tokenId: bigint) => {
      if (tokenId === 1n) {
        return "0x00000000000000000000000000000000000000AA";
      }
      return "0x00000000000000000000000000000000000000BB";
    });

    bindings.ticket.queryTransferEvents = vi.fn().mockResolvedValue([
      {
        from: "0x0000000000000000000000000000000000000000",
        to: "0x00000000000000000000000000000000000000bb",
        tokenId: 1n,
        blockNumber: 1,
        logIndex: 1,
        txHash: "0x1",
      },
      {
        from: "0x0000000000000000000000000000000000000000",
        to: "0x00000000000000000000000000000000000000bb",
        tokenId: 2n,
        blockNumber: 2,
        logIndex: 1,
        txHash: "0x2",
      },
      {
        from: "0x00000000000000000000000000000000000000bb",
        to: "0x00000000000000000000000000000000000000aa",
        tokenId: 1n,
        blockNumber: 3,
        logIndex: 1,
        txHash: "0x3",
      },
    ]);

    bindings.marketplace.getListing = vi.fn().mockImplementation(async (tokenId: bigint) => {
      if (tokenId === 2n) {
        return {
          seller: "0x00000000000000000000000000000000000000BB",
          price: parseEther("0.09"),
        };
      }

      return {
        seller: "0x0000000000000000000000000000000000000000",
        price: 0n,
      };
    });

    const client = createChainTicketClientFromBindings(config, bindings);
    const tickets = await client.getMyTickets("0x00000000000000000000000000000000000000BB");

    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      tokenId: 2n,
      listed: true,
      listingPrice: parseEther("0.09"),
    });
  });

  it("returns only active listings and computes market stats", async () => {
    const bindings = makeBaseBindings();

    bindings.marketplace.queryListedEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 2n,
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.08"),
        blockNumber: 2,
        logIndex: 1,
        txHash: "0x2",
      },
      {
        tokenId: 5n,
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.09"),
        blockNumber: 3,
        logIndex: 1,
        txHash: "0x3",
      },
      {
        tokenId: 7n,
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.1"),
        blockNumber: 4,
        logIndex: 1,
        txHash: "0x4",
      },
    ]);

    bindings.marketplace.getListing = vi.fn().mockImplementation(async (tokenId: bigint) => {
      if (tokenId === 5n) {
        return {
          seller: "0x0000000000000000000000000000000000000000",
          price: 0n,
        };
      }

      return {
        seller: "0x00000000000000000000000000000000000000AA",
        price: tokenId === 2n ? parseEther("0.08") : parseEther("0.1"),
      };
    });

    const client = createChainTicketClientFromBindings(config, bindings);
    const listings = await client.getListings();
    const stats = await client.getMarketStats();

    expect(listings.map((listing) => listing.tokenId)).toEqual([2n, 7n]);
    expect(stats.floorPrice).toBe(parseEther("0.08"));
    expect(stats.maxPrice).toBe(parseEther("0.1"));
    expect(stats.listingCount).toBe(2);
  });

  it("blocks stale listing in buy preflight", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(config, bindings);

    const action: PreflightAction = {
      type: "buy",
      tokenId: 1n,
      price: parseEther("0.09"),
      expectedSeller: "0x00000000000000000000000000000000000000BB",
    };

    const preflight = await client.preflightAction(action);

    expect(preflight.ok).toBe(false);
    expect(preflight.blockers.join(" ")).toMatch(/seller changed/i);
  });

  it("uses primary price for mint and forwards write actions", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(config, bindings);

    await client.mintPrimary();
    await client.approveTicket(9n);
    await client.listTicket(9n, parseEther("0.08"));
    await client.listTicketWithPermit?.(10n, parseEther("0.07"));
    await client.buyTicket(4n, parseEther("0.09"));

    expect(bindings.ticket.mintPrimary).toHaveBeenCalledWith(parseEther("0.1"));
    expect(bindings.ticket.approve).toHaveBeenCalledWith(config.marketplaceAddress, 9n);
    expect(bindings.marketplace.list).toHaveBeenCalledWith(9n, parseEther("0.08"));
    expect(bindings.marketplace.listWithPermit).toHaveBeenCalledWith(10n, parseEther("0.07"));
    expect(bindings.marketplace.buy).toHaveBeenCalledWith(4n, parseEther("0.09"));
  });

  it("routes V2 standard mint, FanPass mint, and organizer buyback with the correct values", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(v2Config, bindings);

    await client.mintStandardTicket?.(true);
    await client.mintFanPassTicket?.(
      {
        ticketEventId: "v2-event",
        address: "0x00000000000000000000000000000000000000BB",
        signer: "0x00000000000000000000000000000000000000CC",
        deadline: 1234n,
        signature: "0xsigned",
      },
      true,
    );
    await client.organizerBuyback?.(8n);

    expect(bindings.ticket.mintStandard).toHaveBeenCalledWith(true, parseEther("0.11"));
    expect(bindings.ticket.mintFanPass).toHaveBeenCalledWith(
      "0xsigned",
      true,
      1234n,
      parseEther("0.11"),
    );
    expect(bindings.marketplace.organizerBuyback).toHaveBeenCalledWith(8n, parseEther("0.1"));
  });

  it("routes collectible check-in through the registry with the ticket owner as receiver", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(v2Config, bindings);

    await client.markTicketUsed?.(12n);
    await client.checkInToCollectible?.(12n);

    expect(bindings.checkInRegistry.markUsed).toHaveBeenCalledWith(12n);
    expect(bindings.ticket.ownerOf).toHaveBeenCalledWith(12n);
    expect(bindings.checkInRegistry.checkInAndTransform).toHaveBeenCalledWith(
      12n,
      "0x00000000000000000000000000000000000000BB",
    );
  });

  it("routes insurance claims through the V2 insurance pool", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(v2Config, bindings);

    await client.claimInsurance?.(12n);

    expect(bindings.insurancePool?.claim).toHaveBeenCalledWith(12n);
  });

  it("routes perk redemption through the V2 perk manager", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(v2Config, bindings);

    await client.redeemPerk?.("0xperk");

    expect(bindings.perkManager?.redeemPerk).toHaveBeenCalledWith("0xperk");
  });

  it("routes merch redemption through the V2 merch store", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(v2Config, bindings);

    await client.redeemMerch?.("tee-black-l");

    expect(bindings.merchStore?.redeem).toHaveBeenCalledWith("tee-black-l");
  });

  it("returns preview-ready base uris in system state", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(config, bindings);

    const systemState = await client.getSystemState();

    expect(systemState.baseTokenURI).toBe("ipfs://ticket/base/");
    expect(systemState.collectibleBaseURI).toBe("ipfs://ticket/collectible/");
  });

  it("keeps scanner-admin separate from governance admin in role detection", async () => {
    const bindings = makeBaseBindings();
    bindings.ticket.hasRole = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    bindings.checkInRegistry.hasRole = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const client = createChainTicketClientFromBindings(config, bindings);
    const roles = await client.getUserRoles?.("0x00000000000000000000000000000000000000BB");

    expect(roles).toEqual({
      isAdmin: false,
      isBuybackOperator: false,
      isScannerAdmin: true,
      isPauser: true,
      isScanner: true,
    });
  });

  it("keeps preflight blockers for mint/list/cancel scenarios", async () => {
    const bindings = makeBaseBindings();
    bindings.ticket.totalMinted = vi.fn().mockResolvedValue(100n);
    bindings.ticket.maxSupply = vi.fn().mockResolvedValue(100n);
    bindings.ticket.balanceOf = vi.fn().mockResolvedValue(2n);
    bindings.ticket.maxPerWallet = vi.fn().mockResolvedValue(2n);
    bindings.ticket.ownerOf = vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000CC");
    bindings.ticket.getApproved = vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000DD");
    bindings.ticket.isApprovedForAll = vi.fn().mockResolvedValue(false);
    bindings.checkInRegistry.isUsed = vi.fn().mockResolvedValue(true);
    bindings.marketplace.getListing = vi.fn().mockResolvedValue({
      seller: "0x0000000000000000000000000000000000000000",
      price: parseEther("0.09"),
    });

    const client = createChainTicketClientFromBindings(config, bindings);

    const mintPreflight = await client.preflightAction({ type: "mint" });
    expect(mintPreflight.blockers).toEqual(
      expect.arrayContaining(["Event is sold out.", "Wallet ticket limit reached."]),
    );

    const listPreflight = await client.preflightAction({
      type: "list",
      tokenId: 1n,
      price: parseEther("0.2"),
    });
    expect(listPreflight.blockers).toEqual(
      expect.arrayContaining([
        "Listing price exceeds primary cap.",
        "Only the owner can list this ticket.",
        "Marketplace approval missing for this token.",
        "Used tickets cannot be listed.",
      ]),
    );

    const listWithPermitPreflight = await client.preflightAction({
      type: "list_with_permit",
      tokenId: 1n,
      price: parseEther("0.2"),
    });
    expect(listWithPermitPreflight.blockers).toEqual(
      expect.arrayContaining([
        "Listing price exceeds primary cap.",
        "Only the owner can list this ticket.",
        "Used tickets cannot be listed.",
      ]),
    );
    expect(listWithPermitPreflight.blockers).not.toContain("Marketplace approval missing for this token.");

    const cancelPreflight = await client.preflightAction({
      type: "cancel",
      tokenId: 1n,
      expectedSeller: "0x00000000000000000000000000000000000000BB",
    });
    expect(cancelPreflight.blockers).toEqual(
      expect.arrayContaining(["Listing is already inactive."]),
    );
  });

  it("keeps V2 preflight blockers for FanPass mint and organizer buyback", async () => {
    const bindings = makeBaseBindings();
    bindings.ticket.totalMinted = vi.fn().mockResolvedValue(100n);
    bindings.ticket.maxSupply = vi.fn().mockResolvedValue(100n);
    bindings.ticket.fanPassSupplyCap = vi.fn().mockResolvedValue(30n);
    bindings.ticket.fanPassMinted = vi.fn().mockResolvedValue(30n);
    bindings.ticket.balanceOf = vi.fn().mockResolvedValue(2n);
    bindings.ticket.maxPerWallet = vi.fn().mockResolvedValue(2n);
    bindings.marketplace.hasRole = vi.fn().mockResolvedValue(false);
    bindings.ticket.ticketClassOf = vi.fn().mockResolvedValue(0);
    bindings.checkInRegistry.isUsed = vi.fn().mockResolvedValue(false);
    bindings.ticket.getApproved = vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000DD");
    bindings.ticket.isApprovedForAll = vi.fn().mockResolvedValue(false);

    const client = createChainTicketClientFromBindings(v2Config, bindings);

    const fanPassPreflight = await client.preflightAction({
      type: "mint_fanpass",
      insured: true,
      deadline: 1234n,
      signature: "0xsigned",
    });
    expect(fanPassPreflight.blockers).toEqual(
      expect.arrayContaining([
        "Event is sold out.",
        "FanPass allocation exhausted.",
        "Wallet ticket limit reached.",
      ]),
    );

    const buybackPreflight = await client.preflightAction({
      type: "organizer_buyback",
      tokenId: 9n,
    });
    expect(buybackPreflight.blockers).toEqual(
      expect.arrayContaining([
        "BUYBACK_ROLE is required for organizer buyback.",
        "Only FanPass tickets can be bought back.",
        "Marketplace approval missing for this token.",
      ]),
    );
  });

  it("keeps scanner preflight coverage for direct check-in and collectible transform", async () => {
    const bindings = makeBaseBindings();
    bindings.checkInRegistry.hasRole = vi.fn().mockResolvedValue(true);

    const client = createChainTicketClientFromBindings(v2Config, bindings);

    const markUsedPreflight = await client.preflightAction({
      type: "checkin_mark_used",
      tokenId: 4n,
    });
    const transformPreflight = await client.preflightAction({
      type: "checkin_transform",
      tokenId: 4n,
    });

    expect(markUsedPreflight.ok).toBe(true);
    expect(markUsedPreflight.gasEstimate).toBe(11111n);
    expect(bindings.checkInRegistry.simulateMarkUsed).toHaveBeenCalledWith(4n);

    expect(transformPreflight.ok).toBe(true);
    expect(transformPreflight.gasEstimate).toBe(22222n);
    expect(bindings.checkInRegistry.simulateCheckInAndTransform).toHaveBeenCalledWith(
      4n,
      "0x00000000000000000000000000000000000000BB",
    );
  });

  it("keeps insurance-claim preflight coverage for claimable insured tickets", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(v2Config, bindings);

    const preflight = await client.preflightAction({
      type: "claim_insurance",
      tokenId: 4n,
    });

    expect(preflight.ok).toBe(true);
    expect(preflight.gasEstimate).toBe(33333n);
    expect(bindings.ticket.coverageOf).toHaveBeenCalledWith(4n);
    expect(bindings.insurancePool?.simulateClaim).toHaveBeenCalledWith(4n);
  });

  it("keeps perk-redemption preflight coverage for unlocked perks", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(v2Config, bindings);

    const preflight = await client.preflightAction({
      type: "redeem_perk",
      perkId: "0xperk",
    });

    expect(preflight.ok).toBe(true);
    expect(preflight.gasEstimate).toBe(43333n);
    expect(bindings.perkManager?.perkOf).toHaveBeenCalledWith("0xperk");
    expect(bindings.perkManager?.canAccess).toHaveBeenCalledWith(
      "0x00000000000000000000000000000000000000bb",
      "0xperk",
    );
    expect(bindings.perkManager?.simulateRedeemPerk).toHaveBeenCalledWith("0xperk");
  });

  it("keeps merch-redemption preflight coverage for active in-stock SKUs", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(v2Config, bindings);

    const preflight = await client.preflightAction({
      type: "redeem_merch",
      skuId: "tee-black-l",
    });

    expect(preflight.ok).toBe(true);
    expect(preflight.gasEstimate).toBe(44444n);
    expect(bindings.merchStore?.getSku).toHaveBeenCalledWith("tee-black-l");
    expect(bindings.fanFuelBank?.balanceOf).toHaveBeenCalledWith(
      "0x00000000000000000000000000000000000000bb",
    );
    expect(bindings.merchStore?.simulateRedeem).toHaveBeenCalledWith("tee-black-l");
  });

  it("keeps timeline ordering, kinds, and timestamps stable", async () => {
    const bindings = makeBaseBindings();
    bindings.ticket.queryTransferEventsByToken = vi.fn().mockResolvedValue([
      {
        from: "0x0000000000000000000000000000000000000000",
        to: "0x00000000000000000000000000000000000000BB",
        tokenId: 5n,
        blockNumber: 8,
        logIndex: 0,
        txHash: "0xmint",
      },
      {
        from: "0x00000000000000000000000000000000000000BB",
        to: "0x00000000000000000000000000000000000000AA",
        tokenId: 5n,
        blockNumber: 10,
        logIndex: 3,
        txHash: "0xtransfer",
      },
    ]);
    bindings.marketplace.queryListedEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 5n,
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.08"),
        blockNumber: 11,
        logIndex: 2,
        txHash: "0xlisted",
      },
    ]);
    bindings.marketplace.queryCancelledEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 5n,
        actor: "0x00000000000000000000000000000000000000AA",
        blockNumber: 12,
        logIndex: 1,
        txHash: "0xcancelled",
      },
    ]);
    bindings.marketplace.querySoldEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 5n,
        seller: "0x00000000000000000000000000000000000000AA",
        buyer: "0x00000000000000000000000000000000000000DD",
        price: parseEther("0.08"),
        feeAmount: parseEther("0.004"),
        blockNumber: 13,
        logIndex: 1,
        txHash: "0xsold",
      },
    ]);
    bindings.checkInRegistry.queryUsedEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 5n,
        scanner: "0x00000000000000000000000000000000000000EE",
        blockNumber: 14,
        logIndex: 0,
        txHash: "0xused",
      },
    ]);
    bindings.ticket.queryCollectibleModeEvents = vi.fn().mockResolvedValue([
      {
        enabled: true,
        blockNumber: 15,
        logIndex: 0,
        txHash: "0xcollectible",
      },
    ]);
    bindings.getBlockTimestamp = vi.fn().mockImplementation(async (blockNumber: number) => {
      return blockNumber * 100;
    });

    const client = createChainTicketClientFromBindings(config, bindings);
    const timeline = await client.getTicketTimeline(5n);

    expect(timeline.map((entry) => entry.kind)).toEqual([
      "collectible",
      "used",
      "sold",
      "cancelled",
      "listed",
      "transfer",
      "mint",
    ]);
    expect(timeline[0]?.timestamp).toBe(1500);
    expect(timeline[timeline.length - 1]?.timestamp).toBe(800);
    expect(timeline[0]?.description).toMatch(/Collectible mode enabled/i);
    expect(timeline[timeline.length - 1]?.description).toMatch(/Primary mint/i);
  });
});
