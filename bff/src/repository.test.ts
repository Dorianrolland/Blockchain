import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock("./db.js", () => dbMock);

import {
  getEventDeployments,
  getFanTicketProfileStats,
  getMarketStats,
  getOperationalSummary,
  getTicketsByOwner,
} from "./repository.js";

describe("repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes floor, median, max, average, and suggested list price from active listings", async () => {
    dbMock.pool.query.mockResolvedValueOnce({
      rows: [{ price_wei: "300" }, { price_wei: "100" }, { price_wei: "200" }],
    });

    const stats = await getMarketStats("main-event");

    expect(stats).toEqual({
      listingCount: 3,
      floorPriceWei: "100",
      medianPriceWei: "200",
      maxPriceWei: "300",
      averagePriceWei: "200",
      suggestedListPriceWei: "200",
    });
  });

  it("returns stored tickets for the requested owner address", async () => {
    const rows = [
      {
        token_id: "7",
        owner: "0x00000000000000000000000000000000000000aa",
        used: true,
        token_uri: "ipfs://ticket/7.json",
        listed: false,
        listing_price_wei: null,
      },
    ];

    dbMock.pool.query.mockResolvedValueOnce({ rows });

    const tickets = await getTicketsByOwner(
      "0x00000000000000000000000000000000000000AA",
      "main-event",
    );

    expect(tickets).toEqual(rows);
    expect(dbMock.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE ticket_event_id = $1 AND LOWER(owner) = LOWER($2)"),
      ["main-event", "0x00000000000000000000000000000000000000AA"],
    );
  });

  it("returns active role assignments and recent admin activity for an event", async () => {
    dbMock.pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            ticket_event_id: "main-event",
            contract_scope: "ticket",
            role_id: "0xrole",
            account: "0x00000000000000000000000000000000000000aa",
            granted_by: "0x00000000000000000000000000000000000000bb",
            is_active: true,
            updated_block: "42",
            updated_tx_hash: "0xgrant",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            activity_id: "main-event:0xgrant:0:ticket:role_granted",
            ticket_event_id: "main-event",
            contract_scope: "ticket",
            activity_type: "role_granted",
            role_id: "0xrole",
            account: "0x00000000000000000000000000000000000000aa",
            actor: "0x00000000000000000000000000000000000000bb",
            block_number: "42",
            log_index: 0,
            tx_hash: "0xgrant",
            block_timestamp: "1700000000",
          },
        ],
      });

    const summary = await getOperationalSummary("main-event");

    expect(summary).toEqual({
      roles: [
        {
          ticketEventId: "main-event",
          contractScope: "ticket",
          roleId: "0xrole",
          account: "0x00000000000000000000000000000000000000aa",
          grantedBy: "0x00000000000000000000000000000000000000bb",
          isActive: true,
          updatedBlock: 42,
          updatedTxHash: "0xgrant",
        },
      ],
      recentActivity: [
        {
          id: "main-event:0xgrant:0:ticket:role_granted",
          ticketEventId: "main-event",
          contractScope: "ticket",
          type: "role_granted",
          roleId: "0xrole",
          account: "0x00000000000000000000000000000000000000aa",
          actor: "0x00000000000000000000000000000000000000bb",
          blockNumber: 42,
          logIndex: 0,
          txHash: "0xgrant",
          timestamp: 1700000000,
        },
      ],
    });
  });

  it("returns current and listed ticket counts for a fan profile view", async () => {
    dbMock.pool.query.mockResolvedValueOnce({
      rows: [
        {
          current_ticket_count: "3",
          listed_ticket_count: "1",
        },
      ],
    });

    const stats = await getFanTicketProfileStats(
      "0x00000000000000000000000000000000000000AA",
      "main-event",
    );

    expect(stats).toEqual({
      currentTicketCount: 3,
      listedTicketCount: 1,
    });
    expect(dbMock.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("COUNT(*) FILTER (WHERE listed = TRUE)::text AS listed_ticket_count"),
      ["main-event", "0x00000000000000000000000000000000000000AA"],
    );
  });

  it("returns stored V2 deployment wiring including the perk manager address", async () => {
    dbMock.pool.query.mockResolvedValueOnce({
      rows: [
        {
          ticket_event_id: "v2-event",
          name: "Paris Finals",
          symbol: "PF26",
          version: "v2",
          artist_id: "artist-alpha",
          series_id: "tour-2026",
          primary_price_wei: "100",
          max_supply: "200",
          fan_pass_allocation_bps: "3000",
          artist_royalty_bps: "500",
          treasury: "0x0000000000000000000000000000000000000001",
          admin: "0x0000000000000000000000000000000000000002",
          ticket_nft_address: "0x0000000000000000000000000000000000000003",
          marketplace_address: "0x0000000000000000000000000000000000000004",
          checkin_registry_address: "0x0000000000000000000000000000000000000005",
          collectible_contract: "0x0000000000000000000000000000000000000006",
          fan_score_registry: "0x0000000000000000000000000000000000000007",
          fan_fuel_bank: "0x0000000000000000000000000000000000000008",
          insurance_pool: "0x0000000000000000000000000000000000000009",
          oracle_adapter: "0x0000000000000000000000000000000000000010",
          merch_store: "0x0000000000000000000000000000000000000011",
          perk_manager: "0x0000000000000000000000000000000000000012",
          deployment_block: "321",
          registered_at: "654",
        },
      ],
    });

    const deployments = await getEventDeployments();

    expect(deployments).toEqual([
      {
        ticketEventId: "v2-event",
        name: "Paris Finals",
        symbol: "PF26",
        version: "v2",
        artistId: "artist-alpha",
        seriesId: "tour-2026",
        primaryPriceWei: "100",
        maxSupply: "200",
        fanPassAllocationBps: "3000",
        artistRoyaltyBps: "500",
        treasury: "0x0000000000000000000000000000000000000001",
        admin: "0x0000000000000000000000000000000000000002",
        ticketNftAddress: "0x0000000000000000000000000000000000000003",
        marketplaceAddress: "0x0000000000000000000000000000000000000004",
        checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
        collectibleContract: "0x0000000000000000000000000000000000000006",
        fanScoreRegistry: "0x0000000000000000000000000000000000000007",
        fanFuelBank: "0x0000000000000000000000000000000000000008",
        insurancePool: "0x0000000000000000000000000000000000000009",
        oracleAdapter: "0x0000000000000000000000000000000000000010",
        merchStore: "0x0000000000000000000000000000000000000011",
        perkManager: "0x0000000000000000000000000000000000000012",
        deploymentBlock: 321,
        registeredAt: 654,
      },
    ]);
    expect(dbMock.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("perk_manager"),
    );
  });
});
