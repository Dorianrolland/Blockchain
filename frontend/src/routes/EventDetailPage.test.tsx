import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { EventDetailPage } from "./EventDetailPage";

const useAppStateMock = vi.fn();
vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
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
        venueName: "Accor Arena",
        city: "Paris",
        countryCode: "FR",
        category: "Pop",
      },
    ],
    setSelectedEventId: vi.fn(),
    marketStats: {
      listingCount: 2,
      floorPrice: 80000000000000000n,
      medianPrice: 90000000000000000n,
      maxPrice: 100000000000000000n,
      averagePrice: 90000000000000000n,
      suggestedListPrice: 90000000000000000n,
    },
    systemState: {
      primaryPrice: 100000000000000000n,
      maxSupply: 100n,
      totalMinted: 10n,
      maxPerWallet: 2n,
      paused: false,
      collectibleMode: false,
    },
    walletAddress: "0x00000000000000000000000000000000000000AA",
    connectWallet: vi.fn(),
    preparePreview: vi.fn(),
    pendingPreview: null,
    runtimeConfig: {
      apiBaseUrl: null,
    },
    setErrorMessage: vi.fn(),
    setStatusMessage: vi.fn(),
    txState: {
      status: "idle",
      timestamp: Date.now(),
    },
    ...overrides,
  };
}

describe("EventDetailPage", () => {
  it("renders the sticky primary access block and opens the mint preview", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    const state = makeAppState();
    useAppStateMock.mockReturnValue(state);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter initialEntries={["/app/explore/main-event"]}>
            <Routes>
              <Route path="/app/explore/:eventId" element={<EventDetailPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: /Paris Finals/i })).toBeInTheDocument();
    expect(screen.getByText("Core rails")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /this event still runs on the core rail set/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Ticket capability map/i })).toBeInTheDocument();
    expect(screen.getByText(/Fan-Fuel and reputation/i)).toBeInTheDocument();
    expect(screen.getByText(/Why this ticket is safer/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Ticket rules" }));
    expect(screen.getByText(/Visible wallet cap/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Mint primary ticket/i }));
    expect(state.preparePreview).toHaveBeenCalledTimes(1);
  });

  it("requests a FanPass attestation before opening the V2 checkout preview", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    const state = makeAppState({
      availableEvents: [
        {
          ticketEventId: "main-event",
          name: "Paris Finals",
          symbol: "PF26",
          version: "v2",
          primaryPriceWei: "100000000000000000",
          maxSupply: "100",
          fanPassAllocationBps: "3000",
          treasury: "0x0000000000000000000000000000000000000001",
          admin: "0x0000000000000000000000000000000000000002",
          ticketNftAddress: "0x0000000000000000000000000000000000000003",
          marketplaceAddress: "0x0000000000000000000000000000000000000004",
          checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
          deploymentBlock: 100,
          registeredAt: 1700000000,
          venueName: "Accor Arena",
          city: "Paris",
          countryCode: "FR",
          category: "Pop",
        },
      ],
      systemState: {
        version: "v2",
        primaryPrice: 100000000000000000n,
        insurancePremium: 10000000000000000n,
        maxSupply: 100n,
        totalMinted: 10n,
        maxPerWallet: 2n,
        fanPassSupplyCap: 30n,
        fanPassMinted: 3n,
        paused: false,
        collectibleMode: false,
      },
      runtimeConfig: {
        apiBaseUrl: "http://localhost:8787",
      },
    });
    useAppStateMock.mockReturnValue(state);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ticketEventId: "main-event",
            address: "0x00000000000000000000000000000000000000AA",
            signer: "0x00000000000000000000000000000000000000BB",
            deadline: "1234",
            signature: "0xsigned",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter initialEntries={["/app/explore/main-event"]}>
            <Routes>
              <Route path="/app/explore/:eventId" element={<EventDetailPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Full fan stack")).toBeInTheDocument();
    expect(screen.getByText(/Protected fan lane/i)).toBeInTheDocument();
    expect(screen.getByText("30.00%")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "FanPass" }));
    await userEvent.click(screen.getByRole("button", { name: /Mint FanPass/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/v1/fans/0x00000000000000000000000000000000000000AA/fanpass-attestation?eventId=main-event",
      expect.any(Object),
    );
    expect(state.preparePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({
          type: "mint_fanpass",
          signature: "0xsigned",
          deadline: 1234n,
        }),
      }),
    );
  });
});
