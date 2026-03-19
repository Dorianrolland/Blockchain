import { afterEach, describe, expect, it, vi } from "vitest";

import { BffClient, createBffClient } from "./bffClient";

describe("BffClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests JSON endpoints without browser cache revalidation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                ticketEventId: "demo-event",
                name: "Demo Event",
                symbol: "DEMO",
                primaryPriceWei: "100",
                maxSupply: "10",
                treasury: "0x0000000000000000000000000000000000000001",
                admin: "0x0000000000000000000000000000000000000002",
                ticketNftAddress: "0x0000000000000000000000000000000000000003",
                marketplaceAddress: "0x0000000000000000000000000000000000000004",
                checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
                deploymentBlock: 1,
                registeredAt: 2,
              },
            ],
            defaultEventId: "demo-event",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    const client = new BffClient("http://localhost:8787");
    const response = await client.listEvents();

    expect(response.defaultEventId).toBe("demo-event");
    expect(response.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/v1/events",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      }),
    );
  });

  it("returns null when the base URL is missing", () => {
    expect(createBffClient(null)).toBeNull();
  });

  it("parses fan profile, collectibles, perks, merch, ticket coverage, and FanPass attestation payloads", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ticketEventId: "v2-event",
            address: "0x00000000000000000000000000000000000000aa",
            version: "v2",
            artistId: "artist-alpha",
            seriesId: "tour-2026",
            reputationScore: "125",
            tierLevel: 1,
            tierLabel: "silver",
            fuelBalance: "40",
            artistAttendanceCount: "2",
            currentTicketCount: 1,
            listedTicketCount: 0,
            collectibleCount: "1",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ticketEventId: "v2-event",
            address: "0x00000000000000000000000000000000000000aa",
            items: [
              {
                collectibleId: "19",
                owner: "0x00000000000000000000000000000000000000aa",
                originFan: "0x00000000000000000000000000000000000000aa",
                sourceTicketId: "7",
                sourceTicketClass: 1,
                level: "2",
                tokenURI: "ipfs://collectible/19.json",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ticketEventId: "v2-event",
            address: "0x00000000000000000000000000000000000000aa",
            items: [
              {
                perkId: "0xperk",
                artistKey: "0xartist",
                minScore: "20",
                minAttendances: "1",
                fuelCost: "10",
                active: true,
                metadataURI: "ipfs://perks/backstage-pass.json",
                unlocked: true,
                redeemedCount: 1,
                lastRedeemedTxHash: "0xperk-tx",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ticketEventId: "v2-event",
            items: [
              {
                skuId: "tee-black-l",
                price: "15",
                stock: "4",
                active: true,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ticketEventId: "v2-event",
            address: "0x00000000000000000000000000000000000000aa",
            items: [
              {
                skuId: "tee-black-l",
                twinId: "3",
                fan: "0x00000000000000000000000000000000000000aa",
                fuelCost: "15",
                txHash: "0xmerch",
                blockNumber: 111,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ticketEventId: "v2-event",
            tokenId: "7",
            supported: true,
            insured: true,
            claimed: false,
            claimable: true,
            payoutBps: 5000,
            weatherRoundId: "12",
            premiumPaidWei: "10000000000000000",
            payoutAmountWei: "50000000000000000",
            policyActive: true,
            reportHash: "0xabc",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ticketEventId: "v2-event",
            address: "0x00000000000000000000000000000000000000aa",
            signer: "0x00000000000000000000000000000000000000bb",
            deadline: "1234",
            signature: "0xsigned",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const client = new BffClient("http://localhost:8787");
    const fanProfile = await client.getFanProfile(
      "0x00000000000000000000000000000000000000aa",
      "v2-event",
    );
    const collectibles = await client.getFanCollectibles(
      "0x00000000000000000000000000000000000000aa",
      "v2-event",
    );
    const perks = await client.getFanPerks(
      "0x00000000000000000000000000000000000000aa",
      "v2-event",
    );
    const merchCatalog = await client.getMerchCatalog("v2-event");
    const merchRedemptions = await client.getFanMerchRedemptions(
      "0x00000000000000000000000000000000000000aa",
      "v2-event",
    );
    const coverage = await client.getTicketCoverage(7n, "v2-event");
    const attestation = await client.getFanPassAttestation(
      "0x00000000000000000000000000000000000000aa",
      "v2-event",
    );

    expect(fanProfile.tierLabel).toBe("silver");
    expect(fanProfile.reputationScore).toBe(125n);
    expect(fanProfile.collectibleCount).toBe(1n);
    expect(collectibles[0]?.collectibleId).toBe(19n);
    expect(collectibles[0]?.sourceTicketClass).toBe(1);
    expect(perks[0]?.fuelCost).toBe(10n);
    expect(perks[0]?.unlocked).toBe(true);
    expect(merchCatalog[0]?.stock).toBe(4n);
    expect(merchRedemptions[0]?.twinId).toBe(3n);
    expect(coverage.supported).toBe(true);
    expect(coverage.tokenId).toBe(7n);
    expect(coverage.payoutAmount).toBe(50000000000000000n);
    expect(attestation.deadline).toBe(1234n);
    expect(attestation.signature).toBe("0xsigned");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8787/v1/fans/0x00000000000000000000000000000000000000aa/profile?eventId=v2-event",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8787/v1/fans/0x00000000000000000000000000000000000000aa/collectibles?eventId=v2-event",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:8787/v1/fans/0x00000000000000000000000000000000000000aa/perks?eventId=v2-event",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:8787/v1/merch/catalog?eventId=v2-event",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "http://localhost:8787/v1/fans/0x00000000000000000000000000000000000000aa/merch-redemptions?eventId=v2-event",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "http://localhost:8787/v1/tickets/7/coverage?eventId=v2-event",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "http://localhost:8787/v1/fans/0x00000000000000000000000000000000000000aa/fanpass-attestation?eventId=v2-event",
      expect.any(Object),
    );
  });

});
