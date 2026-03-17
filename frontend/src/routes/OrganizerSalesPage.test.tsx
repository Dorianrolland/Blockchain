import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { OrganizerSalesPage } from "./OrganizerSalesPage";

const useAppStateMock = vi.fn();
vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    listings: [],
    marketStats: {
      listingCount: 0,
      floorPrice: null,
      medianPrice: null,
      maxPrice: null,
      averagePrice: null,
      suggestedListPrice: null,
    },
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
    indexedReadsAvailable: true,
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
      },
    ],
    selectedEventId: "main-event",
    walletAddress: "0x00000000000000000000000000000000000000AA",
    connectWallet: vi.fn(),
    preparePreview: vi.fn(),
    userRoles: {
      isAdmin: false,
      isBuybackOperator: true,
      isScannerAdmin: false,
      isPauser: false,
      isScanner: false,
    },
    setErrorMessage: vi.fn(),
    ...overrides,
  };
}

describe("OrganizerSalesPage", () => {
  it("opens a buyback preview for V2 FanPass operations", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    const state = makeAppState();
    useAppStateMock.mockReturnValue(state);

    render(
      <I18nProvider>
        <MemoryRouter>
          <OrganizerSalesPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    await userEvent.type(screen.getByLabelText(/FanPass token/i), "42");
    await userEvent.click(screen.getByRole("button", { name: /Run buyback/i }));

    expect(state.preparePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        action: {
          type: "organizer_buyback",
          tokenId: 42n,
        },
      }),
    );
  });
});
