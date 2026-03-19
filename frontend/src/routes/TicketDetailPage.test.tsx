import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { TicketDetailPage } from "./TicketDetailPage";

const useAppStateMock = vi.fn();
const getCollectibleByIdFromChainMock = vi.fn();
const getTicketCoverageMock = vi.fn();
vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));
vi.mock("../lib/collectibles", () => ({
  getCollectibleByIdFromChain: (...args: unknown[]) => getCollectibleByIdFromChainMock(...args),
}));
vi.mock("../lib/bffClient", () => ({
  createBffClient: () => ({
    getTicketCoverage: (...args: unknown[]) => getTicketCoverageMock(...args),
  }),
}));

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    fetchTicketTimeline: vi.fn().mockResolvedValue([
      {
        id: "timeline-1",
        tokenId: 7n,
        kind: "collectible",
        blockNumber: 120,
        txHash: "0xabc",
        timestamp: 1_700_000_000,
        description: "Collectible mode enabled",
      },
    ]),
    contractConfig: {
      eventId: "main-event",
      eventName: "Paris Finals",
      explorerTxBaseUrl: "https://amoy.polygonscan.com/tx/",
    },
    indexedReadsAvailable: true,
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
      primaryPrice: 100000000000000000n,
      maxSupply: 100n,
      totalMinted: 10n,
      maxPerWallet: 2n,
      paused: false,
      collectibleMode: false,
      baseTokenURI: "ipfs://ticket/base/",
      collectibleBaseURI: "ipfs://ticket/collectible/",
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
        source: "ticketmaster",
        sourceUrl: "https://ticketmaster.example/paris-finals",
      },
    ],
    selectedEventId: "main-event",
    watchlist: new Set<string>(),
    toggleWatch: vi.fn(),
    walletAddress: "0x00000000000000000000000000000000000000AA",
    preparePreview: vi.fn(),
    setErrorMessage: vi.fn(),
    ...overrides,
  };
}

describe("TicketDetailPage", () => {
  beforeEach(() => {
    getCollectibleByIdFromChainMock.mockReset();
    getTicketCoverageMock.mockReset();
    getTicketCoverageMock.mockResolvedValue({
      ticketEventId: "main-event",
      tokenId: 7n,
      supported: false,
      insured: false,
      claimed: false,
      claimable: false,
      payoutBps: 0,
      weatherRoundId: 0n,
      premiumPaid: 0n,
      payoutAmount: 0n,
      policyActive: false,
      reportHash: null,
    });
  });

  it("renders the pass hero, collectible toggle, and QR panel", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter initialEntries={["/app/tickets/7"]}>
            <Routes>
              <Route path="/app/tickets/:tokenId" element={<TicketDetailPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByRole("heading", { name: /Paris Finals/i })).length).toBeGreaterThan(0);
    expect(screen.getByText(/Demo pass only - not official venue admission/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Live pass" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Mobile entry QR/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Collectible" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Collectible" })).toHaveAttribute("aria-selected", "true");
    });

    expect(screen.getByRole("heading", { name: /Lifecycle proof/i })).toBeInTheDocument();
  }, 15000);

  it("renders collectible detail facts when opened from a souvenir link", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    getCollectibleByIdFromChainMock.mockResolvedValue({
      collectibleId: 19n,
      owner: "0x00000000000000000000000000000000000000AA",
      originFan: "0x00000000000000000000000000000000000000AA",
      sourceTicketId: 7n,
      sourceTicketClass: 0,
      level: 3n,
      tokenURI: "ipfs://ticket/collectible/19.json",
    });
    useAppStateMock.mockReturnValue(
      makeAppState({
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
          <MemoryRouter initialEntries={["/app/tickets/7?view=collectible&collectibleId=19"]}>
            <Routes>
              <Route path="/app/tickets/:tokenId" element={<TicketDetailPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: /Collectible souvenir/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(getCollectibleByIdFromChainMock).toHaveBeenCalledWith(
        expect.objectContaining({
          collectibleContractAddress: "0x0000000000000000000000000000000000000006",
          collectibleId: 19n,
        }),
      );
    });
    expect(screen.queryByText(/Mobile entry QR/i)).not.toBeInTheDocument();
    expect(screen.getByText("Source ticket")).toBeInTheDocument();
    expect(screen.getAllByText(/Collectible #19|#19/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("#7").length).toBeGreaterThan(0);
  }, 15000);

  it("opens an insurance-claim preview when the ticket coverage is claimable", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    getTicketCoverageMock.mockResolvedValue({
      ticketEventId: "main-event",
      tokenId: 7n,
      supported: true,
      insured: true,
      claimed: false,
      claimable: true,
      payoutBps: 5000,
      weatherRoundId: 77n,
      premiumPaid: 10000000000000000n,
      payoutAmount: 50000000000000000n,
      policyActive: true,
      reportHash: null,
    });
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
          collectibleContract: "0x0000000000000000000000000000000000000006",
          insurancePool: "0x0000000000000000000000000000000000000007",
          deploymentBlock: 100,
          registeredAt: 1700000000,
        },
      ],
    });
    useAppStateMock.mockReturnValue(appState);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter initialEntries={["/app/tickets/7"]}>
            <Routes>
              <Route path="/app/tickets/:tokenId" element={<TicketDetailPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Claim payout" }));

    expect(appState.preparePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Claim payout",
        action: {
          type: "claim_insurance",
          tokenId: 7n,
        },
      }),
    );
  }, 15000);
});
