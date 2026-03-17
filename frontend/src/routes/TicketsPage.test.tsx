import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { TicketsPage } from "./TicketsPage";

const useAppStateMock = vi.fn();
const getCollectiblesByOwnerFromChainMock = vi.fn();
const getMerchCatalogFromChainMock = vi.fn();
const getMerchRedemptionsByFanFromChainMock = vi.fn();
const getPerksForFanFromChainMock = vi.fn();
vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));
vi.mock("../lib/collectibles", () => ({
  getCollectiblesByOwnerFromChain: (...args: unknown[]) =>
    getCollectiblesByOwnerFromChainMock(...args),
}));
vi.mock("../lib/merch", () => ({
  getMerchCatalogFromChain: (...args: unknown[]) => getMerchCatalogFromChainMock(...args),
  getMerchRedemptionsByFanFromChain: (...args: unknown[]) =>
    getMerchRedemptionsByFanFromChainMock(...args),
}));
vi.mock("../lib/perks", () => ({
  getPerksForFanFromChain: (...args: unknown[]) => getPerksForFanFromChainMock(...args),
}));

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    tickets: [],
    walletAddress: "0x00000000000000000000000000000000000000AA",
    watchlist: new Set<string>(),
    toggleWatch: vi.fn(),
    refreshDashboard: vi.fn(),
    uiMode: "advanced",
    connectWallet: vi.fn(),
    preparePreview: vi.fn(),
    setErrorMessage: vi.fn(),
    txState: {
      status: "idle",
      timestamp: Date.now(),
    },
    indexedReadsAvailable: false,
    indexedReadsIssue: "Indexer has not caught up past deployment block 100.",
    runtimeConfig: {
      apiBaseUrl: "http://localhost:8787",
    },
    contractConfig: {
      eventId: "main-event",
      rpcUrl: "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      deploymentBlock: 100,
    },
    selectedEventName: "Paris Finals",
    availableEvents: [
      {
        ticketEventId: "main-event",
        name: "Paris Finals",
        symbol: "PF26",
        primaryPriceWei: "100000000000000000",
        maxSupply: "100",
        treasury: "0x0000000000000000000000000000000000000001",
        admin: "0x0000000000000000000000000000000000000002",
        ticketNftAddress: "0x0000000000000000000000000000000000000003",
        marketplaceAddress: "0x0000000000000000000000000000000000000004",
        checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
        deploymentBlock: 100,
        registeredAt: 1700000000,
        isDemoInspired: true,
        demoDisclaimer: "Demo pass only - not official venue admission",
      },
    ],
    selectedEventId: "main-event",
    ...overrides,
  };
}

describe("TicketsPage", () => {
  beforeEach(() => {
    getCollectiblesByOwnerFromChainMock.mockReset();
    getCollectiblesByOwnerFromChainMock.mockResolvedValue([]);
    getMerchCatalogFromChainMock.mockReset();
    getMerchCatalogFromChainMock.mockResolvedValue([]);
    getMerchRedemptionsByFanFromChainMock.mockReset();
    getMerchRedemptionsByFanFromChainMock.mockResolvedValue([]);
    getPerksForFanFromChainMock.mockReset();
    getPerksForFanFromChainMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a fallback-read warning instead of an empty inventory message when the BFF is not ready", () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <TicketsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Indexed enrichments delayed")).toBeInTheDocument();
    expect(
      screen.getByText(/passes still load from direct chain reads/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("You do not own any tickets yet.")).not.toBeInTheDocument();
  });

  it("keeps rendering owned passes while indexed reads are degraded", () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(
      makeAppState({
        tickets: [
          {
            tokenId: 7n,
            owner: "0x00000000000000000000000000000000000000AA",
            used: false,
            tokenURI: "ipfs://ticket/base/7.json",
            listed: false,
            listingPrice: null,
          },
        ],
        systemState: {
          collectibleMode: false,
          baseTokenURI: "ipfs://ticket/base/",
          collectibleBaseURI: "ipfs://ticket/collectible/",
        },
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <TicketsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Your passes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open pass" })).toBeInTheDocument();
    expect(screen.getAllByText(/token #7/i).length).toBeGreaterThan(0);
  });

  it("renders V2 collectibles in the vault alongside live ticket inventory", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    getCollectiblesByOwnerFromChainMock.mockResolvedValue([
      {
        collectibleId: 19n,
        owner: "0x00000000000000000000000000000000000000AA",
        originFan: "0x00000000000000000000000000000000000000AA",
        sourceTicketId: 7n,
        sourceTicketClass: 0,
        level: 2n,
        tokenURI: "ipfs://ticket/collectible/19.json",
      },
    ]);
    useAppStateMock.mockReturnValue(
      makeAppState({
        indexedReadsAvailable: false,
        availableEvents: [
          {
            ticketEventId: "main-event",
            name: "Paris Finals",
            symbol: "PF26",
            version: "v2",
            primaryPriceWei: "100000000000000000",
            maxSupply: "100",
            treasury: "0x0000000000000000000000000000000000000001",
            admin: "0x0000000000000000000000000000000000000002",
            ticketNftAddress: "0x0000000000000000000000000000000000000003",
            marketplaceAddress: "0x0000000000000000000000000000000000000004",
            checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
            collectibleContract: "0x0000000000000000000000000000000000000006",
            deploymentBlock: 100,
            registeredAt: 1700000000,
          },
        ],
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <TicketsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("link", { name: "Open souvenir" })).toHaveAttribute(
      "href",
      "/app/tickets/7?view=collectible&collectibleId=19",
    );
    expect(screen.getByRole("heading", { name: "Collectibles", level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Level\s*2/i)).toBeInTheDocument();
    expect(getCollectiblesByOwnerFromChainMock).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "0x00000000000000000000000000000000000000AA",
        collectibleContractAddress: "0x0000000000000000000000000000000000000006",
      }),
    );
  });

  it("renders merch catalog and opens a redemption preview from the vault", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    getMerchCatalogFromChainMock.mockResolvedValue([
      {
        skuId: "tee-black-l",
        price: 15n,
        stock: 4n,
        active: true,
      },
    ]);
    getMerchRedemptionsByFanFromChainMock.mockResolvedValue([
      {
        skuId: "tee-black-l",
        twinId: 3n,
        fan: "0x00000000000000000000000000000000000000AA",
        fuelCost: 15n,
        txHash: "0xabc123",
        blockNumber: 111,
      },
    ]);
    const appState = makeAppState({
      availableEvents: [
        {
          ticketEventId: "main-event",
          name: "Paris Finals",
          symbol: "PF26",
          version: "v2",
          primaryPriceWei: "100000000000000000",
          maxSupply: "100",
          treasury: "0x0000000000000000000000000000000000000001",
          admin: "0x0000000000000000000000000000000000000002",
          ticketNftAddress: "0x0000000000000000000000000000000000000003",
          marketplaceAddress: "0x0000000000000000000000000000000000000004",
          checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
          merchStore: "0x0000000000000000000000000000000000000007",
          deploymentBlock: 100,
          registeredAt: 1700000000,
        },
      ],
    });
    useAppStateMock.mockReturnValue(appState);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <TicketsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Phygital merch", level: 2 })).toBeInTheDocument();
    expect((await screen.findAllByText("tee-black-l")).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Twin #3/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Redeem with FanFuel" }));

    expect(appState.preparePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Merch redemption: tee-black-l",
        action: {
          type: "redeem_merch",
          skuId: "tee-black-l",
        },
      }),
    );
    expect(getMerchCatalogFromChainMock).toHaveBeenCalledWith(
      expect.objectContaining({
        merchStoreAddress: "0x0000000000000000000000000000000000000007",
      }),
    );
    expect(getMerchRedemptionsByFanFromChainMock).toHaveBeenCalledWith(
      expect.objectContaining({
        merchStoreAddress: "0x0000000000000000000000000000000000000007",
        fan: "0x00000000000000000000000000000000000000AA",
      }),
    );
  });

  it("renders on-chain perks and opens a perk redemption preview from the vault", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    getPerksForFanFromChainMock.mockResolvedValue([
      {
        perkId: "0xperk",
        artistKey: "0xartist",
        minScore: 20n,
        minAttendances: 1n,
        fuelCost: 10n,
        active: true,
        metadataURI: "ipfs://perks/backstage-pass.json",
        unlocked: true,
        redeemedCount: 1,
        lastRedeemedTxHash: "0xperk-tx",
      },
    ]);
    const appState = makeAppState({
      availableEvents: [
        {
          ticketEventId: "main-event",
          name: "Paris Finals",
          symbol: "PF26",
          version: "v2",
          primaryPriceWei: "100000000000000000",
          maxSupply: "100",
          treasury: "0x0000000000000000000000000000000000000001",
          admin: "0x0000000000000000000000000000000000000002",
          ticketNftAddress: "0x0000000000000000000000000000000000000003",
          marketplaceAddress: "0x0000000000000000000000000000000000000004",
          checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
          perkManager: "0x0000000000000000000000000000000000000008",
          deploymentBlock: 100,
          registeredAt: 1700000000,
        },
      ],
    });
    useAppStateMock.mockReturnValue(appState);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <TicketsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "On-chain perks", level: 2 })).toBeInTheDocument();
    expect(await screen.findByText("backstage pass")).toBeInTheDocument();
    expect(await screen.findByText(/Redemptions/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Redeem perk" }));

    expect(appState.preparePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Perk redemption: backstage pass",
        action: {
          type: "redeem_perk",
          perkId: "0xperk",
        },
      }),
    );
    expect(getPerksForFanFromChainMock).toHaveBeenCalledWith(
      expect.objectContaining({
        perkManagerAddress: "0x0000000000000000000000000000000000000008",
        fan: "0x00000000000000000000000000000000000000AA",
      }),
    );
  });

  it("prefers BFF V2 fan surfaces when indexed reads are available", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("/v1/fans/") && url.includes("/profile")) {
        return new Response(
          JSON.stringify({
            ticketEventId: "main-event",
            address: "0x00000000000000000000000000000000000000AA",
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
        );
      }

      if (url.includes("/v1/fans/") && url.includes("/collectibles")) {
        return new Response(
          JSON.stringify({
            ticketEventId: "main-event",
            address: "0x00000000000000000000000000000000000000AA",
            items: [
              {
                collectibleId: "19",
                owner: "0x00000000000000000000000000000000000000AA",
                originFan: "0x00000000000000000000000000000000000000AA",
                sourceTicketId: "7",
                sourceTicketClass: 1,
                level: "2",
                tokenURI: "ipfs://collectible/19.json",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/v1/fans/") && url.includes("/perks")) {
        return new Response(
          JSON.stringify({
            ticketEventId: "main-event",
            address: "0x00000000000000000000000000000000000000AA",
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
        );
      }

      if (url.includes("/v1/merch/catalog")) {
        return new Response(
          JSON.stringify({
            ticketEventId: "main-event",
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
        );
      }

      if (url.includes("/v1/fans/") && url.includes("/merch-redemptions")) {
        return new Response(
          JSON.stringify({
            ticketEventId: "main-event",
            address: "0x00000000000000000000000000000000000000AA",
            items: [
              {
                skuId: "tee-black-l",
                twinId: "3",
                fan: "0x00000000000000000000000000000000000000AA",
                fuelCost: "15",
                txHash: "0xmerch",
                blockNumber: 111,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("", { status: 404 });
    });

    useAppStateMock.mockReturnValue(
      makeAppState({
        indexedReadsAvailable: true,
        availableEvents: [
          {
            ticketEventId: "main-event",
            name: "Paris Finals",
            symbol: "PF26",
            version: "v2",
            primaryPriceWei: "100000000000000000",
            maxSupply: "100",
            treasury: "0x0000000000000000000000000000000000000001",
            admin: "0x0000000000000000000000000000000000000002",
            ticketNftAddress: "0x0000000000000000000000000000000000000003",
            marketplaceAddress: "0x0000000000000000000000000000000000000004",
            checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
            collectibleContract: "0x0000000000000000000000000000000000000006",
            merchStore: "0x0000000000000000000000000000000000000007",
            perkManager: "0x0000000000000000000000000000000000000008",
            deploymentBlock: 100,
            registeredAt: 1700000000,
          },
        ],
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <TicketsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("backstage pass")).toBeInTheDocument();
    expect(await screen.findByText(/Twin #3/i)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Open souvenir" })).toHaveAttribute(
      "href",
      "/app/tickets/7?view=collectible&collectibleId=19",
    );
    expect(getCollectiblesByOwnerFromChainMock).not.toHaveBeenCalled();
    expect(getMerchCatalogFromChainMock).not.toHaveBeenCalled();
    expect(getMerchRedemptionsByFanFromChainMock).not.toHaveBeenCalled();
    expect(getPerksForFanFromChainMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });
});
