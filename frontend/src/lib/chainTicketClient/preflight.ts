import { mapEthersError } from "../errors";
import type {
  ContractConfig,
  ListingHealth,
  PreflightAction,
  PreflightResult,
} from "../../types/chainticket";
import type { ChainTicketBindings } from "./internalTypes";
import {
  BUYBACK_ROLE,
  normalizeAddress,
  sameAddress,
  SCANNER_ROLE,
  ZERO_ADDRESS,
} from "./parsers";

async function safeSimulation(
  simulate: (() => Promise<void>) | undefined,
  estimateGas: (() => Promise<bigint>) | undefined,
  blockers: string[],
): Promise<{ simulationPassed: boolean; gasEstimate: bigint | null }> {
  if (!simulate && !estimateGas) {
    return { simulationPassed: false, gasEstimate: null };
  }

  let simulationPassed = false;
  let gasEstimate: bigint | null = null;

  if (simulate) {
    try {
      await simulate();
      simulationPassed = true;
    } catch (error) {
      blockers.push(mapEthersError(error));
    }
  }

  if (estimateGas) {
    try {
      gasEstimate = await estimateGas();
    } catch (error) {
      blockers.push(`Gas estimation failed: ${mapEthersError(error)}`);
    }
  }

  return { simulationPassed, gasEstimate };
}

function uniqueMessages(messages: string[]): string[] {
  return Array.from(new Set(messages.filter((message) => message.trim().length > 0)));
}

export async function createListingHealth(
  bindings: ChainTicketBindings,
  tokenId: bigint,
  expectedSeller?: string,
  expectedPrice?: bigint,
): Promise<ListingHealth> {
  const [listing, used] = await Promise.all([
    bindings.marketplace.getListing(tokenId),
    bindings.checkInRegistry.isUsed(tokenId),
  ]);

  const isActive = !sameAddress(listing.seller, ZERO_ADDRESS);
  const normalizedExpectedSeller = expectedSeller ? normalizeAddress(expectedSeller) : null;
  const sellerMatchesExpectation = normalizedExpectedSeller
    ? sameAddress(listing.seller, normalizedExpectedSeller)
    : true;
  const priceMatchesExpectation = expectedPrice !== undefined ? listing.price === expectedPrice : true;

  let reason: string | undefined;
  if (!isActive) {
    reason = "Listing is no longer active.";
  } else if (used) {
    reason = "Ticket already marked used.";
  } else if (!sellerMatchesExpectation) {
    reason = "Listing seller changed since your last refresh.";
  } else if (!priceMatchesExpectation) {
    reason = "Listing price changed since your last refresh.";
  }

  return {
    tokenId,
    isActive,
    seller: isActive ? normalizeAddress(listing.seller) : null,
    price: isActive ? listing.price : null,
    used,
    sellerMatchesExpectation,
    priceMatchesExpectation,
    reason,
  };
}

async function getWalletCapRemaining(
  bindings: ChainTicketBindings,
  walletAddress: string,
): Promise<bigint | null> {
  const balanceReader = bindings.ticket.balanceOf;
  if (!balanceReader) {
    return null;
  }

  const [balance, maxPerWallet] = await Promise.all([
    balanceReader(walletAddress),
    bindings.ticket.maxPerWallet(),
  ]);

  const remaining = maxPerWallet - balance;
  return remaining > 0n ? remaining : 0n;
}

export function buildPreflightAction({
  config,
  bindings,
  getSignerAddress,
  hasSigner,
}: {
  config: ContractConfig;
  bindings: ChainTicketBindings;
  getSignerAddress: () => Promise<string | null>;
  hasSigner: () => boolean;
}): (action: PreflightAction) => Promise<PreflightResult> {
  return async (action: PreflightAction): Promise<PreflightResult> => {
    const blockers: string[] = [];
    const warnings: string[] = [];

    const signerAddress = await getSignerAddress();

    if (!hasSigner() || !signerAddress) {
      blockers.push("Connect a wallet to run a transaction pre-check.");
      return {
        action: action.type,
        ok: false,
        blockers,
        warnings,
        gasEstimate: null,
        simulationPassed: false,
        listingHealth: null,
        walletCapRemaining: null,
      };
    }

    const [systemState, walletCapRemaining] = await Promise.all([
      Promise.all([
        bindings.ticket.paused(),
        bindings.ticket.primaryPrice(),
        bindings.ticket.totalMinted(),
        bindings.ticket.maxSupply(),
        bindings.ticket.insurancePremium?.().catch(() => null) ?? Promise.resolve(null),
        bindings.ticket.fanPassSupplyCap?.().catch(() => null) ?? Promise.resolve(null),
        bindings.ticket.fanPassMinted?.().catch(() => null) ?? Promise.resolve(null),
      ]),
      getWalletCapRemaining(bindings, signerAddress),
    ]);

    const [
      isPaused,
      primaryPrice,
      totalMinted,
      maxSupply,
      insurancePremiumValue,
      fanPassSupplyCap,
      fanPassMinted,
    ] = systemState;
    const insurancePremium = insurancePremiumValue ?? 0n;
    const standardSupplyCap = fanPassSupplyCap !== null ? maxSupply - fanPassSupplyCap : null;
    const standardMinted = fanPassMinted !== null ? totalMinted - fanPassMinted : null;

    if (isPaused) {
      blockers.push("System is paused.");
    }

    let listingHealth: ListingHealth | null = null;
    let simulationPassed = false;
    let gasEstimate: bigint | null = null;

    if (action.type === "mint") {
      if (totalMinted >= maxSupply) {
        blockers.push("Event is sold out.");
      }

      if (walletCapRemaining !== null && walletCapRemaining <= 0n) {
        blockers.push("Wallet ticket limit reached.");
      }

      const simulation = await safeSimulation(
        () => bindings.ticket.simulateMint?.(primaryPrice) ?? Promise.resolve(),
        () => bindings.ticket.estimateMintGas?.(primaryPrice) ?? Promise.resolve(0n),
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "mint_standard") {
      if (totalMinted >= maxSupply) {
        blockers.push("Event is sold out.");
      }

      if (
        standardMinted !== null &&
        standardSupplyCap !== null &&
        standardMinted >= standardSupplyCap
      ) {
        blockers.push("Standard allocation exhausted.");
      }

      if (walletCapRemaining !== null && walletCapRemaining <= 0n) {
        blockers.push("Wallet ticket limit reached.");
      }

      const totalValue = primaryPrice + (action.insured ? insurancePremium : 0n);
      const simulation = await safeSimulation(
        bindings.ticket.simulateMintStandard
          ? () => bindings.ticket.simulateMintStandard?.(action.insured, totalValue) ?? Promise.resolve()
          : !action.insured && bindings.ticket.simulateMint
            ? () => bindings.ticket.simulateMint?.(totalValue) ?? Promise.resolve()
            : undefined,
        bindings.ticket.estimateMintStandardGas
          ? () =>
              bindings.ticket.estimateMintStandardGas?.(action.insured, totalValue) ??
              Promise.resolve(0n)
          : !action.insured && bindings.ticket.estimateMintGas
            ? () => bindings.ticket.estimateMintGas?.(totalValue) ?? Promise.resolve(0n)
            : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "mint_fanpass") {
      if (totalMinted >= maxSupply) {
        blockers.push("Event is sold out.");
      }

      if (fanPassMinted !== null && fanPassSupplyCap !== null && fanPassMinted >= fanPassSupplyCap) {
        blockers.push("FanPass allocation exhausted.");
      }

      if (walletCapRemaining !== null && walletCapRemaining <= 0n) {
        blockers.push("Wallet ticket limit reached.");
      }

      const totalValue = primaryPrice + (action.insured ? insurancePremium : 0n);
      const simulation = await safeSimulation(
        bindings.ticket.simulateMintFanPass
          ? () =>
              bindings.ticket.simulateMintFanPass?.(
                action.signature,
                action.insured,
                action.deadline,
                totalValue,
              ) ?? Promise.resolve()
          : undefined,
        bindings.ticket.estimateMintFanPassGas
          ? () =>
              bindings.ticket.estimateMintFanPassGas?.(
                action.signature,
                action.insured,
                action.deadline,
                totalValue,
              ) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "checkin_mark_used" || action.type === "checkin_transform") {
      if (bindings.checkInRegistry.hasRole) {
        try {
          const hasScannerRole = await bindings.checkInRegistry.hasRole(SCANNER_ROLE, signerAddress);
          if (!hasScannerRole) {
            blockers.push("SCANNER_ROLE is required for check-in.");
          }
        } catch (error) {
          blockers.push(mapEthersError(error));
        }
      }

      let owner: string | null = null;
      try {
        const [resolvedOwner, used] = await Promise.all([
          bindings.ticket.ownerOf(action.tokenId),
          bindings.checkInRegistry.isUsed(action.tokenId),
        ]);
        owner = resolvedOwner;
        if (used) {
          blockers.push("Ticket already used.");
        }
      } catch (error) {
        blockers.push(mapEthersError(error));
      }

      if (action.type === "checkin_mark_used") {
        const simulation = await safeSimulation(
          bindings.checkInRegistry.simulateMarkUsed
            ? () => bindings.checkInRegistry.simulateMarkUsed?.(action.tokenId) ?? Promise.resolve()
            : undefined,
          bindings.checkInRegistry.estimateMarkUsedGas
            ? () => bindings.checkInRegistry.estimateMarkUsedGas?.(action.tokenId) ?? Promise.resolve(0n)
            : undefined,
          blockers,
        );
        simulationPassed = simulation.simulationPassed;
        gasEstimate = simulation.gasEstimate;
      }

      if (action.type === "checkin_transform") {
        if (!bindings.checkInRegistry.checkInAndTransform) {
          blockers.push("Collectible check-in is unavailable in this wallet client.");
        }

        const receiver = owner ?? signerAddress;
        const simulation = await safeSimulation(
          bindings.checkInRegistry.simulateCheckInAndTransform
            ? () =>
                bindings.checkInRegistry.simulateCheckInAndTransform?.(action.tokenId, receiver) ??
                Promise.resolve()
            : undefined,
          bindings.checkInRegistry.estimateCheckInAndTransformGas
            ? () =>
                bindings.checkInRegistry.estimateCheckInAndTransformGas?.(action.tokenId, receiver) ??
                Promise.resolve(0n)
            : undefined,
          blockers,
        );
        simulationPassed = simulation.simulationPassed;
        gasEstimate = simulation.gasEstimate;
      }
    }

    if (action.type === "claim_insurance") {
      const insurancePool = bindings.insurancePool;

      if (!insurancePool?.claim) {
        blockers.push("Insurance claim is unavailable in this wallet client.");
      }

      try {
        const owner = await bindings.ticket.ownerOf(action.tokenId);
        if (!sameAddress(owner, signerAddress)) {
          blockers.push("Only the ticket owner can claim insurance.");
        }
      } catch (error) {
        blockers.push(mapEthersError(error));
      }

      if (bindings.ticket.coverageOf) {
        try {
          const coverage = await bindings.ticket.coverageOf(action.tokenId);
          if (!coverage.insured) {
            blockers.push("Ticket is not insured.");
          }
          if (coverage.claimed) {
            blockers.push("Coverage already claimed.");
          }
          if (!coverage.claimable) {
            blockers.push("Insurance claim is not open.");
          }
        } catch (error) {
          blockers.push(mapEthersError(error));
        }
      } else {
        warnings.push("Coverage status could not be verified in preflight.");
      }

      const simulation = await safeSimulation(
        insurancePool?.simulateClaim
          ? () => insurancePool.simulateClaim?.(action.tokenId) ?? Promise.resolve()
          : undefined,
        insurancePool?.estimateClaimGas
          ? () => insurancePool.estimateClaimGas?.(action.tokenId) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "redeem_perk") {
      const perkManager = bindings.perkManager;

      if (!perkManager?.redeemPerk) {
        blockers.push("Perk redemption is unavailable in this wallet client.");
      }

      if (!action.perkId.trim()) {
        blockers.push("Perk id is required for perk redemption.");
      }

      let perkFuelCost: bigint | null = null;
      if (perkManager?.perkOf) {
        try {
          const perk = await perkManager.perkOf(action.perkId);
          perkFuelCost = perk.fuelCost;

          if (!perk.active) {
            blockers.push("Selected perk is inactive.");
          }
        } catch (error) {
          blockers.push(mapEthersError(error));
        }
      } else {
        warnings.push("Perk state could not be verified in preflight.");
      }

      if (perkManager?.canAccess) {
        try {
          const unlocked = await perkManager.canAccess(signerAddress, action.perkId);
          if (!unlocked) {
            blockers.push("Perk is still locked for this fan.");
          }
        } catch (error) {
          blockers.push(mapEthersError(error));
        }
      } else {
        warnings.push("Perk access could not be verified in preflight.");
      }

      if (bindings.fanFuelBank?.balanceOf) {
        try {
          const balance = await bindings.fanFuelBank.balanceOf(signerAddress);
          if (perkFuelCost !== null && balance < perkFuelCost) {
            blockers.push("Insufficient FanFuel balance for this perk.");
          }
        } catch (error) {
          blockers.push(mapEthersError(error));
        }
      } else {
        warnings.push("FanFuel balance could not be verified in preflight.");
      }

      const simulation = await safeSimulation(
        perkManager?.simulateRedeemPerk
          ? () => perkManager.simulateRedeemPerk?.(action.perkId) ?? Promise.resolve()
          : undefined,
        perkManager?.estimateRedeemPerkGas
          ? () => perkManager.estimateRedeemPerkGas?.(action.perkId) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "redeem_merch") {
      const merchStore = bindings.merchStore;

      if (!merchStore?.redeem) {
        blockers.push("Merch redemption is unavailable in this wallet client.");
      }

      if (!action.skuId.trim()) {
        blockers.push("SKU id is required for merch redemption.");
      }

      let skuPrice: bigint | null = null;
      if (merchStore?.getSku) {
        try {
          const sku = await merchStore.getSku(action.skuId);
          skuPrice = sku.price;

          if (!sku.active) {
            blockers.push("Selected merch SKU is inactive.");
          }
          if (sku.stock <= 0n) {
            blockers.push("Selected merch SKU is out of stock.");
          }
        } catch (error) {
          blockers.push(mapEthersError(error));
        }
      } else {
        warnings.push("SKU availability could not be verified in preflight.");
      }

      if (bindings.fanFuelBank?.balanceOf) {
        try {
          const balance = await bindings.fanFuelBank.balanceOf(signerAddress);
          if (skuPrice !== null && balance < skuPrice) {
            blockers.push("Insufficient FanFuel balance for this redemption.");
          }
        } catch (error) {
          blockers.push(mapEthersError(error));
        }
      } else {
        warnings.push("FanFuel balance could not be verified in preflight.");
      }

      const simulation = await safeSimulation(
        merchStore?.simulateRedeem
          ? () => merchStore.simulateRedeem?.(action.skuId) ?? Promise.resolve()
          : undefined,
        merchStore?.estimateRedeemGas
          ? () => merchStore.estimateRedeemGas?.(action.skuId) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "approve") {
      try {
        const owner = await bindings.ticket.ownerOf(action.tokenId);
        if (!sameAddress(owner, signerAddress)) {
          blockers.push("Only the owner can approve this ticket.");
        }
      } catch (error) {
        blockers.push(mapEthersError(error));
      }

      const simulation = await safeSimulation(
        bindings.ticket.simulateApprove
          ? () =>
              bindings.ticket.simulateApprove?.(config.marketplaceAddress, action.tokenId) ??
              Promise.resolve()
          : undefined,
        bindings.ticket.estimateApproveGas
          ? () =>
              bindings.ticket.estimateApproveGas?.(config.marketplaceAddress, action.tokenId) ??
              Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "list") {
      if (action.price <= 0n) {
        blockers.push("Listing price must be greater than zero.");
      }
      if (action.price > primaryPrice) {
        blockers.push("Listing price exceeds primary cap.");
      }

      try {
        const [owner, ticketClass] = await Promise.all([
          bindings.ticket.ownerOf(action.tokenId),
          bindings.ticket.ticketClassOf?.(action.tokenId).catch(() => null) ?? Promise.resolve(null),
        ]);
        if (!sameAddress(owner, signerAddress)) {
          blockers.push("Only the owner can list this ticket.");
        }
        if (ticketClass !== null && ticketClass !== 0) {
          blockers.push("FanPass cannot be listed.");
        }

        const approved = await bindings.ticket.getApproved?.(action.tokenId);
        const approvedForAll = await bindings.ticket.isApprovedForAll?.(
          signerAddress,
          config.marketplaceAddress,
        );

        if (
          approved !== undefined &&
          !sameAddress(approved, config.marketplaceAddress) &&
          !approvedForAll
        ) {
          blockers.push("Marketplace approval missing for this token.");
        }
      } catch (error) {
        blockers.push(mapEthersError(error));
      }

      listingHealth = await createListingHealth(bindings, action.tokenId);
      if (listingHealth.used) {
        blockers.push("Used tickets cannot be listed.");
      }

      const simulation = await safeSimulation(
        bindings.marketplace.simulateList
          ? () => bindings.marketplace.simulateList?.(action.tokenId, action.price) ?? Promise.resolve()
          : undefined,
        bindings.marketplace.estimateListGas
          ? () => bindings.marketplace.estimateListGas?.(action.tokenId, action.price) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "list_with_permit") {
      if (action.price <= 0n) {
        blockers.push("Listing price must be greater than zero.");
      }
      if (action.price > primaryPrice) {
        blockers.push("Listing price exceeds primary cap.");
      }

      try {
        const [owner, ticketClass] = await Promise.all([
          bindings.ticket.ownerOf(action.tokenId),
          bindings.ticket.ticketClassOf?.(action.tokenId).catch(() => null) ?? Promise.resolve(null),
        ]);
        if (!sameAddress(owner, signerAddress)) {
          blockers.push("Only the owner can list this ticket.");
        }
        if (ticketClass !== null && ticketClass !== 0) {
          blockers.push("FanPass cannot be listed.");
        }
      } catch (error) {
        blockers.push(mapEthersError(error));
      }

      listingHealth = await createListingHealth(bindings, action.tokenId);
      if (listingHealth.used) {
        blockers.push("Used tickets cannot be listed.");
      }

      if (!bindings.marketplace.listWithPermit) {
        blockers.push("One-step permit listing is unavailable in this wallet client.");
      } else {
        warnings.push("Wallet signature will be requested to authorize the marketplace in one step.");
      }

      const simulation = await safeSimulation(
        bindings.marketplace.simulateListWithPermit
          ? () =>
              bindings.marketplace.simulateListWithPermit?.(action.tokenId, action.price) ??
              Promise.resolve()
          : undefined,
        bindings.marketplace.estimateListWithPermitGas
          ? () =>
              bindings.marketplace.estimateListWithPermitGas?.(action.tokenId, action.price) ??
              Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "cancel") {
      listingHealth = await createListingHealth(
        bindings,
        action.tokenId,
        action.expectedSeller,
      );

      if (!listingHealth.isActive) {
        blockers.push("Listing is already inactive.");
      }
      if (listingHealth.reason && !listingHealth.isActive) {
        warnings.push(listingHealth.reason);
      }
      if (listingHealth.seller && !sameAddress(listingHealth.seller, signerAddress)) {
        blockers.push("Only the listing seller can cancel this listing.");
      }

      const simulation = await safeSimulation(
        bindings.marketplace.simulateCancel
          ? () => bindings.marketplace.simulateCancel?.(action.tokenId) ?? Promise.resolve()
          : undefined,
        bindings.marketplace.estimateCancelGas
          ? () => bindings.marketplace.estimateCancelGas?.(action.tokenId) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "buy") {
      listingHealth = await createListingHealth(
        bindings,
        action.tokenId,
        action.expectedSeller,
        action.price,
      );

      if (!listingHealth.isActive) {
        blockers.push("Listing is no longer active.");
      }
      if (listingHealth.used) {
        blockers.push("Ticket is already used.");
      }
      if (!listingHealth.sellerMatchesExpectation) {
        blockers.push("Listing seller changed. Refresh and retry.");
      }
      if (!listingHealth.priceMatchesExpectation) {
        blockers.push("Listing price changed. Refresh and retry.");
      }
      if (listingHealth.seller && sameAddress(listingHealth.seller, signerAddress)) {
        blockers.push("Seller cannot buy their own listing.");
      }
      if (walletCapRemaining !== null && walletCapRemaining <= 0n) {
        blockers.push("Buyer wallet limit reached.");
      }
      if (bindings.ticket.ticketClassOf) {
        try {
          const ticketClass = await bindings.ticket.ticketClassOf(action.tokenId);
          if (ticketClass !== 0) {
            blockers.push("FanPass cannot be resold.");
          }
        } catch (error) {
          blockers.push(mapEthersError(error));
        }
      }

      const simulation = await safeSimulation(
        bindings.marketplace.simulateBuy
          ? () => bindings.marketplace.simulateBuy?.(action.tokenId, action.price) ?? Promise.resolve()
          : undefined,
        bindings.marketplace.estimateBuyGas
          ? () => bindings.marketplace.estimateBuyGas?.(action.tokenId, action.price) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "organizer_buyback") {
      if (!bindings.marketplace.organizerBuyback) {
        blockers.push("Organizer buyback is unavailable in this wallet client.");
      }

      if (bindings.marketplace.hasRole) {
        try {
          const hasBuybackRole = await bindings.marketplace.hasRole(BUYBACK_ROLE, signerAddress);
          if (!hasBuybackRole) {
            blockers.push("BUYBACK_ROLE is required for organizer buyback.");
          }
        } catch (error) {
          blockers.push(mapEthersError(error));
        }
      }

      try {
        const [owner, used, ticketClass] = await Promise.all([
          bindings.ticket.ownerOf(action.tokenId),
          bindings.checkInRegistry.isUsed(action.tokenId),
          bindings.ticket.ticketClassOf?.(action.tokenId).catch(() => null) ?? Promise.resolve(null),
        ]);

        if (sameAddress(owner, ZERO_ADDRESS)) {
          blockers.push("Ticket owner could not be resolved.");
        }
        if (used) {
          blockers.push("Used tickets cannot be bought back.");
        }
        if (ticketClass !== null && ticketClass !== 1) {
          blockers.push("Only FanPass tickets can be bought back.");
        }

        const approved = await bindings.ticket.getApproved?.(action.tokenId);
        const approvedForAll = await bindings.ticket.isApprovedForAll?.(
          owner,
          config.marketplaceAddress,
        );

        if (
          approved !== undefined &&
          !sameAddress(approved, config.marketplaceAddress) &&
          !approvedForAll
        ) {
          blockers.push("Marketplace approval missing for this token.");
        }
      } catch (error) {
        blockers.push(mapEthersError(error));
      }

      const simulation = await safeSimulation(
        bindings.marketplace.simulateOrganizerBuyback
          ? () =>
              bindings.marketplace.simulateOrganizerBuyback?.(action.tokenId, primaryPrice) ??
              Promise.resolve()
          : undefined,
        bindings.marketplace.estimateOrganizerBuybackGas
          ? () =>
              bindings.marketplace.estimateOrganizerBuybackGas?.(action.tokenId, primaryPrice) ??
              Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    const uniqueBlockers = uniqueMessages(blockers);
    const uniqueWarnings = uniqueMessages(warnings);

    return {
      action: action.type,
      ok: uniqueBlockers.length === 0,
      blockers: uniqueBlockers,
      warnings: uniqueWarnings,
      gasEstimate,
      simulationPassed,
      listingHealth,
      walletCapRemaining,
    };
  };
}
