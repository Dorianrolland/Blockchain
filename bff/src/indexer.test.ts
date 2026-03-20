import { Interface } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";

function applyBffEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.PORT = "8787";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/chainticket_test";
  process.env.AMOY_RPC_URL = "https://rpc-amoy.polygon.technology";
  process.env.CHAIN_ID = "80002";
  process.env.DEPLOYMENT_BLOCK = "100";
  process.env.TICKET_NFT_ADDRESS = "0x0000000000000000000000000000000000000011";
  process.env.MARKETPLACE_ADDRESS = "0x0000000000000000000000000000000000000022";
  process.env.CHECKIN_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000033";
}

describe("ChainIndexer.applyEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
  });

  it("keeps the existing owner when a used event is applied", async () => {
    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      applyEvent: (
        client: { query: (...args: unknown[]) => Promise<{ rowCount: number }> },
        event: Record<string, unknown>,
        tokenUriMap: Map<string, string>,
      ) => Promise<void>;
    };

    const client = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    };

    await indexer.applyEvent(
      client,
      {
        id: "tx:1:used",
        ticketEventId: "main-event",
        type: "used",
        tokenId: 7n,
        scanner: "0x00000000000000000000000000000000000000bb",
        blockNumber: 42,
        logIndex: 1,
        txHash: "0xused",
        timestamp: 1_700_000_000,
      },
      new Map(),
    );

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ticket_state_items"),
      ["main-event", "7", 42, "0xused"],
    );
  });

  it("falls back to on-chain owner data if a used ticket was never materialized locally", async () => {
    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      applyEvent: (
        client: { query: (...args: unknown[]) => Promise<{ rowCount: number }> },
        event: Record<string, unknown>,
        tokenUriMap: Map<string, string>,
      ) => Promise<void>;
      ticketContract: {
        ownerOf: (tokenId: bigint) => Promise<string>;
        tokenURI: (tokenId: bigint) => Promise<string>;
      };
    };

    indexer.ticketContract = {
      ownerOf: vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000AA"),
      tokenURI: vi.fn().mockResolvedValue("ipfs://ticket/7.json"),
    };
    (indexer as unknown as { contractSets: Map<string, unknown> }).contractSets = new Map([
      [
        "main-event",
        {
          ticketContract: indexer.ticketContract,
        },
      ],
    ]);

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 }),
    };

    await indexer.applyEvent(
      client,
      {
        id: "tx:1:used",
        ticketEventId: "main-event",
        type: "used",
        tokenId: 7n,
        scanner: "0x00000000000000000000000000000000000000bb",
        blockNumber: 42,
        logIndex: 1,
        txHash: "0xused",
        timestamp: 1_700_000_000,
      },
      new Map(),
    );

    expect(indexer.ticketContract.ownerOf).toHaveBeenCalledWith(7n);
    expect(indexer.ticketContract.tokenURI).toHaveBeenCalledWith(7n);
    expect(client.query).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO ticket_state_items"),
      [
        "main-event",
        "7",
        "0x00000000000000000000000000000000000000aa",
        "ipfs://ticket/7.json",
        42,
        "0xused",
      ],
    );
  });
});

describe("ChainIndexer.applyOperationalActivity", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
  });

  it("materializes active role assignments from role grant activity", async () => {
    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      applyOperationalActivity: (
        client: { query: (...args: unknown[]) => Promise<{ rowCount: number }> },
        activity: Record<string, unknown>,
      ) => Promise<void>;
    };

    const client = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    };

    await indexer.applyOperationalActivity(client, {
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
      timestamp: 1_700_000_000,
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO role_state_items"),
      [
        "main-event",
        "ticket",
        "0xrole",
        "0x00000000000000000000000000000000000000aa",
        "0x00000000000000000000000000000000000000bb",
        true,
        42,
        "0xgrant",
      ],
    );
  });
});

describe("ChainIndexer log summaries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
  });

  it("demotes repetitive empty ranges to debug and emits periodic info checkpoints", async () => {
    const { logger } = await import("./logger.js");
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => logger);
    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      logProcessedRangeSummary: (input: {
        fromBlock: number;
        toBlock: number;
        eventCount: number;
        operationalActivityCount: number;
        metadataRefreshCount: number;
        ticketEventIds: string[];
      }) => void;
    };

    for (let range = 0; range < 24; range += 1) {
      indexer.logProcessedRangeSummary({
        fromBlock: range * 120,
        toBlock: range * 120 + 119,
        eventCount: 0,
        operationalActivityCount: 0,
        metadataRefreshCount: 0,
        ticketEventIds: [],
      });
    }

    expect(debugSpy).toHaveBeenCalledTimes(24);
    expect(infoSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ emptyRangesSinceLastInfo: 25 }),
      "Indexer processed empty block ranges.",
    );

    indexer.logProcessedRangeSummary({
      fromBlock: 24 * 120,
      toBlock: 24 * 120 + 119,
      eventCount: 0,
      operationalActivityCount: 0,
      metadataRefreshCount: 0,
      ticketEventIds: [],
    });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 24 * 120,
        toBlock: 24 * 120 + 119,
        emptyRangesSinceLastInfo: 25,
      }),
      "Indexer processed empty block ranges.",
    );
  });
});

describe("ChainIndexer cursor reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
  });

  it("resets a stored cursor that predates the deployment floor", async () => {
    vi.doMock("./db.js", async () => {
      const actual = await vi.importActual<typeof import("./db.js")>("./db.js");
      return {
        ...actual,
        getChainStateNumber: vi.fn().mockResolvedValue(50),
      };
    });

    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      contractSets: Map<string, { deployment: { deploymentBlock: number } }>;
      syncEventDeployments: (force?: boolean) => Promise<void>;
      resetToBlock: (lastIndexedBlock: number) => Promise<void>;
      loop: () => Promise<void>;
      start: () => Promise<void>;
    };

    indexer.syncEventDeployments = vi.fn(async () => {
      indexer.contractSets = new Map([
        [
          "main-event",
          {
            deployment: { deploymentBlock: 100 },
          },
        ],
      ]);
    });
    indexer.resetToBlock = vi.fn().mockResolvedValue(undefined);
    indexer.loop = vi.fn().mockResolvedValue(undefined);

    await indexer.start();

    expect(indexer.resetToBlock).toHaveBeenCalledWith(99);
  });
});

describe("ChainIndexer deployment sources", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
    process.env.FACTORY_ADDRESS = "0x00000000000000000000000000000000000000F1";
  });

  it("merges active demo deployments stored in Postgres with the current factory catalog", async () => {
    const activeDemoPoolQuery = vi.fn().mockResolvedValue({
      rows: [{ ticket_event_id: "demo-fr-bruno-mars-20260618-cb053c" }],
    });
    const getEventDeploymentsMock = vi.fn().mockResolvedValue([
      {
        ticket_event_id: "demo-fr-bruno-mars-20260618-cb053c",
        name: "Bruno Mars",
        symbol: "CTK",
        primary_price_wei: "100000000000000000",
        max_supply: "100",
        treasury: "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
        admin: "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
        ticket_nft_address: "0xD9C51916D00D1dcfB2F0e963FEb8f5EaDbb12cF3",
        marketplace_address: "0x394Ba0cd1f7b916a26bb97101f224212eeef0925",
        checkin_registry_address: "0x00000000000000000000000000000000000000C1",
        deployment_block: "35254994",
        registered_at: "1773637525",
      },
    ]);

    vi.doMock("./db.js", async () => {
      const actual = await vi.importActual<typeof import("./db.js")>("./db.js");
      return {
        ...actual,
        getEventDeployments: getEventDeploymentsMock,
        pool: {
          query: activeDemoPoolQuery,
        },
      };
    });

    const factoryInterface = new Interface([
      "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
    ]);
    const encodedFactoryDeployment = factoryInterface.encodeFunctionResult("getEventAt", [[
      "chainticket-upgrade-demo-20260317",
      "ChainTicket Event",
      "CTK",
      "chainticket-demo-artist",
      "founders-tour-2026",
      100000000000000000n,
      100n,
      3000n,
      500n,
      "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
      "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
      "0xd4213d60832294182A4d5ce82D20538B565efc44",
      "0x1f6EC1Aa94135d2F9B041550258864b4f6EC804d",
      "0x6A36806a87DaE75D4A0523f551686cc3C4c08CAb",
      "0xf66ea1420e5F2f12E99f48442786D46C2501bF87",
      "0x04f94ebaE19311156b03635b0e572035F1f3C1BD",
      "0x2756e4c83135d7B96371E314ca843D9b5aEef06B",
      "0xE5FE07BEC7BDD12c81bE9C29C4AC6E23af016015",
      "0x18CD133d4416C4E3c4E0075e5eB4AD41c2271412",
      "0xD2Bf36dFE39842339f7B9ecb1512f1e9a6d290DF",
      "0x2209B6BDF1d5bAdb5Ae853FFE802ebCe3302F1eA",
      35309527n,
      1773746591n,
    ]]);

    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      provider: { call: (tx: { to: string; data: string }) => Promise<string> };
      factoryContract: { totalEvents: () => Promise<bigint> };
      fetchDeployments: () => Promise<Array<{ ticketEventId: string }>>;
    };

    indexer.provider = {
      call: vi.fn().mockResolvedValue(encodedFactoryDeployment),
    };
    indexer.factoryContract = {
      totalEvents: vi.fn().mockResolvedValue(1n),
    };

    const deployments = await indexer.fetchDeployments();

    expect(deployments.map((deployment) => deployment.ticketEventId)).toEqual([
      "demo-fr-bruno-mars-20260618-cb053c",
      "chainticket-upgrade-demo-20260317",
    ]);
  });

  it("rewinds the cursor when an active demo deployment is newly tracked with historical mints", async () => {
    const poolQuery = vi.fn().mockImplementation(async (query: string) => {
      if (query.includes("FROM demo_event_catalog")) {
        return {
          rows: [{ ticket_event_id: "demo-fr-bruno-mars-20260620-8804d3" }],
        };
      }

      if (query.includes("FROM UNNEST")) {
        return {
          rows: [
            {
              ticket_event_id: "demo-fr-bruno-mars-20260620-8804d3",
              max_block: null,
            },
            {
              ticket_event_id: "chainticket-upgrade-demo-20260317",
              max_block: "35402463",
            },
          ],
        };
      }

      throw new Error(`Unexpected pool query: ${query}`);
    });
    const getEventDeploymentsMock = vi.fn().mockResolvedValue([
      {
        ticket_event_id: "demo-fr-bruno-mars-20260620-8804d3",
        name: "Bruno Mars",
        symbol: "CTK",
        primary_price_wei: "100000000000000000",
        max_supply: "100",
        treasury: "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
        admin: "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
        ticket_nft_address: "0xcC54c08aedEa32F5d81AFD0E811a0899D0eb43a0",
        marketplace_address: "0x394Ba0cd1f7b916a26bb97101f224212eeef0925",
        checkin_registry_address: "0x00000000000000000000000000000000000000C1",
        deployment_block: "35255009",
        registered_at: "1773637525",
      },
      {
        ticket_event_id: "chainticket-upgrade-demo-20260317",
        name: "ChainTicket Event",
        symbol: "CTK",
        primary_price_wei: "100000000000000000",
        max_supply: "100",
        treasury: "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
        admin: "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
        ticket_nft_address: "0xd4213d60832294182A4d5ce82D20538B565efc44",
        marketplace_address: "0x1f6EC1Aa94135d2F9B041550258864b4f6EC804d",
        checkin_registry_address: "0x6A36806a87DaE75D4A0523f551686cc3C4c08CAb",
        deployment_block: "35309527",
        registered_at: "1773746591",
      },
    ]);
    const getChainStateNumberMock = vi.fn().mockResolvedValue(35402463);
    const getChainStateStringMock = vi.fn().mockResolvedValue(null);
    const setChainStateStringMock = vi.fn().mockResolvedValue(undefined);
    const upsertEventDeploymentMock = vi.fn().mockResolvedValue(undefined);
    const withTransactionMock = vi.fn(async (callback: (client: { query: () => Promise<void> }) => Promise<void>) => {
      await callback({
        query: vi.fn().mockResolvedValue(undefined),
      });
    });

    vi.doMock("./db.js", async () => {
      const actual = await vi.importActual<typeof import("./db.js")>("./db.js");
      return {
        ...actual,
        getChainStateNumber: getChainStateNumberMock,
        getChainStateString: getChainStateStringMock,
        getEventDeployments: getEventDeploymentsMock,
        setChainStateString: setChainStateStringMock,
        upsertEventDeployment: upsertEventDeploymentMock,
        withTransaction: withTransactionMock,
        pool: {
          query: poolQuery,
        },
      };
    });

    const factoryInterface = new Interface([
      "function getEventAt(uint256 index) view returns ((string eventId,string name,string symbol,string artistId,string seriesId,uint256 primaryPrice,uint256 maxSupply,uint256 fanPassAllocationBps,uint256 artistRoyaltyBps,address treasury,address admin,address ticketNFT,address marketplace,address checkInRegistry,address collectibleContract,address fanScoreRegistry,address fanFuelBank,address insurancePool,address oracleAdapter,address merchStore,address perkManager,uint256 deploymentBlock,uint256 registeredAt))",
    ]);
    const ticketInterface = new Interface([
      "function totalMinted() view returns (uint256)",
    ]);
    const encodedFactoryDeployment = factoryInterface.encodeFunctionResult("getEventAt", [[
      "chainticket-upgrade-demo-20260317",
      "ChainTicket Event",
      "CTK",
      "chainticket-demo-artist",
      "founders-tour-2026",
      100000000000000000n,
      100n,
      3000n,
      500n,
      "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
      "0xF5653Efc3BCAC6Bdc83B7F9E0E3d19b54bAA7204",
      "0xd4213d60832294182A4d5ce82D20538B565efc44",
      "0x1f6EC1Aa94135d2F9B041550258864b4f6EC804d",
      "0x6A36806a87DaE75D4A0523f551686cc3C4c08CAb",
      "0xf66ea1420e5F2f12E99f48442786D46C2501bF87",
      "0x04f94ebaE19311156b03635b0e572035F1f3C1BD",
      "0x2756e4c83135d7B96371E314ca843D9b5aEef06B",
      "0xE5FE07BEC7BDD12c81bE9C29C4AC6E23af016015",
      "0x18CD133d4416C4E3c4E0075e5eB4AD41c2271412",
      "0xD2Bf36dFE39842339f7B9ecb1512f1e9a6d290DF",
      "0x2209B6BDF1d5bAdb5Ae853FFE802ebCe3302F1eA",
      35309527n,
      1773746591n,
    ]]);
    const encodedTotalMinted = ticketInterface.encodeFunctionResult("totalMinted", [2n]);
    const totalMintedSelector = ticketInterface.getFunction("totalMinted")!.selector;

    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      provider: { call: (tx: { to: string; data: string }) => Promise<string> };
      factoryContract: { totalEvents: () => Promise<bigint> };
      resetToBlock: (lastIndexedBlock: number) => Promise<void>;
      syncEventDeployments: (force?: boolean) => Promise<void>;
    };

    indexer.provider = {
      call: vi.fn().mockImplementation(async (tx: { data: string }) => {
        if (tx.data.startsWith(totalMintedSelector)) {
          return encodedTotalMinted;
        }
        return encodedFactoryDeployment;
      }),
    };
    indexer.factoryContract = {
      totalEvents: vi.fn().mockResolvedValue(1n),
    };
    indexer.resetToBlock = vi.fn().mockResolvedValue(undefined);

    await indexer.syncEventDeployments(true);

    expect(indexer.resetToBlock).toHaveBeenCalledWith(35255008);
  });
});
