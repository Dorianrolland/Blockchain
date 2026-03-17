import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { EventDemoNotice } from "../components/events/EventDemoNotice";
import { EventPoster } from "../components/events/EventPoster";
import {
  Badge,
  ButtonGroup,
  Card,
  EmptyState,
  InfoList,
  PageHeader,
  Panel,
  RiskBanner,
  SectionHeader,
  SegmentedToggle,
  Tag,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { createBffClient } from "../lib/bffClient";
import { mapEthersError } from "../lib/errors";
import { formatEventStart, formatPol } from "../lib/format";
import {
  getEventBenefitBadges,
  getEventDetailTabs,
  getEventTrustPoints,
} from "../lib/workspaceContent";
import { useAppState } from "../state/useAppState";
import type { EventDetailTabKey } from "../types/chainticket";

function formatBpsValue(value?: string): string {
  if (!value) {
    return "-";
  }

  return `${(Number(value) / 100).toFixed(2)}%`;
}

export function EventDetailPage() {
  const { locale } = useI18n();
  const { eventId } = useParams<{ eventId: string }>();
  const {
    availableEvents,
    setSelectedEventId,
    marketStats,
    systemState,
    walletAddress,
    connectWallet,
    preparePreview,
    pendingPreview,
    runtimeConfig,
    indexedReadsAvailable,
    setErrorMessage,
    setStatusMessage,
    txState,
  } = useAppState();
  const [activeTab, setActiveTab] = useState<EventDetailTabKey>("overview");
  const [checkoutMode, setCheckoutMode] = useState<"standard" | "fanpass">("standard");
  const [insured, setInsured] = useState(false);

  const event = eventId
    ? availableEvents.find((candidate) => candidate.ticketEventId === eventId) ?? null
    : availableEvents[0] ?? null;
  const bffClient = useMemo(
    () => createBffClient(runtimeConfig?.apiBaseUrl ?? null),
    [runtimeConfig?.apiBaseUrl],
  );
  const isUpgradedEvent = (event?.version ?? systemState?.version ?? "v1") === "v2";
  const primaryPrice = event ? BigInt(event.primaryPriceWei) : 0n;
  const insurancePremium = isUpgradedEvent ? (systemState?.insurancePremium ?? 0n) : 0n;
  const totalCheckoutPrice = primaryPrice + (insured ? insurancePremium : 0n);
  const fanPassRemaining =
    systemState?.fanPassSupplyCap !== undefined && systemState?.fanPassMinted !== undefined
      ? systemState.fanPassSupplyCap - systemState.fanPassMinted
      : null;
  const fanProfileQuery = useQuery({
    queryKey: [
      "event-detail-fan-profile",
      event?.ticketEventId ?? "no-event",
      walletAddress ?? "no-wallet",
      runtimeConfig?.apiBaseUrl ?? "no-bff",
    ],
    enabled: Boolean(
      bffClient &&
      walletAddress &&
      indexedReadsAvailable &&
      isUpgradedEvent &&
      event?.ticketEventId,
    ),
    retry: 1,
    refetchInterval: 30_000,
    queryFn: async () => bffClient!.getFanProfile(walletAddress!, event!.ticketEventId),
  });

  useEffect(() => {
    if (event) {
      setSelectedEventId(event.ticketEventId);
    }
  }, [event, setSelectedEventId]);

  useEffect(() => {
    if (!isUpgradedEvent && checkoutMode !== "standard") {
      setCheckoutMode("standard");
    }
  }, [checkoutMode, isUpgradedEvent]);

  const copy =
    locale === "fr"
      ? {
          title: "Detail evenement",
          subtitle:
            "La page qui convertit: gros visuel, infos essentielles immediates, bloc d'achat sticky et preuve rendue simple.",
          viewMarket: "Ouvrir le marketplace",
          mint: "Acheter en primaire",
          mintStandard: "Acheter billet standard",
          mintFanPass: "Acheter FanPass",
          connect: "Connect wallet",
          buyPanelTitle: "Acces primaire",
          buyPanelBody:
            "Achetez sans quitter la page. Le pre-check et la signature restent relies au flow on-chain existant, mais l'interface raconte d'abord la valeur utilisateur.",
          checkoutMode: "Mode d'achat",
          modeStandard: "Standard",
          modeFanPass: "FanPass",
          insuranceLabel: "Ajouter l'assurance meteo",
          insuranceHint:
            "L'assurance ouvre un remboursement on-chain si l'oracle signale un alea meteo couvert.",
          totalLabel: "Total checkout",
          fanPassQuotaLabel: "Quota FanPass",
          attestationHint: "Le mint FanPass utilise une attestation signee fournie par le BFF.",
          attestationUnavailable:
            "Le service d'attestation FanPass n'est pas configure. Renseignez l'API BFF pour continuer.",
          attestationRequested: "Attestation FanPass recuperee. Preview en preparation.",
          whySafer: "Pourquoi ce billet rassure davantage",
          whySaferBody:
            "La couche blockchain existe pour proteger la confiance: prix plus lisible, propriete verifiable, collectible apres usage et moins de fraude terrain.",
          collectiblePreview: "Apercu collectible",
          validity: "Billet primaire",
          statusReady: "Pret pour l'achat",
          statusBlocked: "Verifier avant achat",
          active: "Actif",
          standby: "En attente",
          invalidTitle: "Evenement introuvable",
          invalidDescription: "L'evenement selectionne n'a pas pu etre retrouve dans le catalogue actuel.",
          backExplore: "Retour a Explore",
          txTitle: "Etat de transaction",
          txFallback: "Aucune transaction d'achat n'a encore demarre.",
          dateLabel: "Date",
          venueLabel: "Lieu",
          priceLabel: "Prix",
          walletCapLabel: "Cap wallet",
          deploymentVersion: "Set produit",
          versionV1: "Rails legacy",
          versionV2: "Set complet",
          v1StatusTitle: "Cet evenement utilise encore les rails legacy",
          v1StatusCause:
            "Cet evenement tourne encore sur le rail set historique, donc les rails business avances ne sont pas encore actifs sur ce show.",
          v1StatusImpact:
            "Vous gardez mint, revente capee, check-in et mode collectible, mais pas encore Fan-Fuel, FanPass protege, assurance parametrique ou merch phygital.",
          v1StatusAction:
            "Les sections ci-dessous montrent la cible du produit et l'etat reel d'activation de chaque rail sur cet evenement.",
          railsTitle: "Carte des capacites billet",
          railsSubtitle:
            "On rend enfin visible ce que le produit veut devenir: retention fan, protection de la fan-base, assurance et collectibles evolutifs.",
          railFanFuelTitle: "Fan-Fuel et reputation",
          railFanFuelBodyV1:
            "Ce show reste sur le deploiement legacy: pas encore de score de reputation ni de Fan-Fuel depensable pour debloquer les perks.",
          railFanFuelBodyV2:
            "Chaque achat et presence nourrit un score fan et un wallet de Fan-Fuel qui debloquent les futurs avantages.",
          railFanPassTitle: "Acces fan protege",
          railFanPassBodyV1:
            "Le quota protege 30% et les attestations Soulbound n'existent pas encore sur ce deploiement.",
          railFanPassBodyV2:
            "Une part protegee du stock reste reservee a la vraie fan-base avec attestation et buyback organisateur.",
          railInsuranceTitle: "Assurance parametrique",
          railInsuranceBodyV1:
            "L'option assurance meteo n'est pas encore live sur cet evenement.",
          railInsuranceBodyV2:
            "Le checkout peut ajouter une prime qui ouvre un claim on-chain si l'oracle declenche la couverture.",
          railResaleTitle: "Revente regulee",
          railResaleBodyV1:
            "La revente est deja capee, mais la royalty artiste continue n'est pas encore exposee comme rail upgrade complet.",
          railResaleBodyV2:
            "Le marche secondaire devient un canal legal et productise, avec plafond anti-scalping et partage de valeur.",
          railCollectibleTitle: "Collectible evolutif",
          railCollectibleBodyV1:
            "Le mode collectible existe en alpha, mais pas encore le vrai burn-to-collectible evolutif lie a la fidelite artiste.",
          railCollectibleBodyV2:
            "Le billet d'entree se transforme ensuite en souvenir artistique qui peut monter en niveau sur les prochains shows.",
          railLive: "Actif",
          railPartial: "Partiel",
          railPlanned: "Inactif ici",
          railNotLive: "Inactif ici",
          railNeedsV2: "Non actif sur cet event",
          railStatus: "Statut",
          railFanTier: "Tier fan",
          railFanScore: "Score",
          railFanFuel: "Fan-Fuel",
          railFanPassSplit: "Allocation protegee",
          railFanPassLeft: "Places restantes",
          railInsurancePremium: "Prime",
          railOracle: "Oracle",
          railRoyalty: "Royalty artiste",
          railPriceCap: "Prix de reference",
          railCollectibleMode: "Mode collectible",
          railMutation: "Mutation",
          railWalletProfilePending: "Profil fan bientot visible",
          railOracleReady: "Oracle branche",
          railOracleMissing: "Oracle non branche",
          railMutationReady: "Evolution prevue",
          railMutationAlpha: "Reveal alpha",
          walletRequiredTitle: "Wallet requis pour le checkout primaire",
          walletRequiredCause: "Aucune session wallet active.",
          walletRequiredImpact: "Le bloc d'achat reste en lecture seule tant que le wallet n'est pas connecte.",
          walletRequiredAction: "Connectez le wallet pour continuer.",
          mintPreviewLabel: "Achat primaire",
          mintPreviewDescription: "Acheter un billet primaire directement depuis la page evenement.",
          standardPreviewLabel: "Achat standard upgrade",
          standardPreviewDescription:
            "Acheter un billet standard upgrade avec option d'assurance depuis la page evenement.",
          fanPassPreviewLabel: "Achat FanPass protege",
          fanPassPreviewDescription:
            "Acheter un FanPass avec attestation signee et option d'assurance depuis la page evenement.",
          mintPreviewChecks: [
            "Verifie pause, supply et cap wallet avant signature.",
            "Simule localement avant d'ouvrir le wallet.",
            "Affiche un pre-check avant transaction.",
          ],
          benefitBullets: [
            "La revente reste plafonnee par design.",
            "La propriete est verifiee avant l'entree.",
            "Le collectible se revele apres usage.",
          ],
        }
      : {
          title: "Event detail",
          subtitle:
            "The page that converts: huge event visual, top-level facts, a sticky buy block, and proof made simple.",
          viewMarket: "Open marketplace",
          mint: "Mint primary ticket",
          mintStandard: "Mint standard ticket",
          mintFanPass: "Mint FanPass",
          connect: "Connect wallet",
          buyPanelTitle: "Primary access",
          buyPanelBody:
            "Buy without leaving the page. Pre-check and wallet signature still use the existing on-chain flow, but the interface leads with user value first.",
          checkoutMode: "Checkout mode",
          modeStandard: "Standard",
          modeFanPass: "FanPass",
          insuranceLabel: "Add weather insurance",
          insuranceHint:
            "Insurance opens an on-chain claim if the oracle reports a covered weather disruption.",
          totalLabel: "Checkout total",
          fanPassQuotaLabel: "FanPass quota",
          attestationHint: "FanPass mint uses a signed attestation issued by the BFF.",
          attestationUnavailable:
            "FanPass attestation service is not configured. Set the BFF API base URL to continue.",
          attestationRequested: "FanPass attestation received. Preparing transaction preview.",
          whySafer: "Why this ticket is safer",
          whySaferBody:
            "The blockchain layer exists to protect trust: cleaner pricing, verifiable ownership, collectible upside after use, and less venue fraud.",
          collectiblePreview: "Collectible preview",
          validity: "Primary ticket",
          statusReady: "Ready to mint",
          statusBlocked: "Check before mint",
          active: "Active",
          standby: "Standby",
          invalidTitle: "Event not found",
          invalidDescription: "The selected event could not be resolved from the current catalog.",
          backExplore: "Back to Explore",
          txTitle: "Live transaction state",
          txFallback: "No purchase transaction started yet.",
          dateLabel: "Date",
          venueLabel: "Venue",
          priceLabel: "Price",
          walletCapLabel: "Wallet cap",
          deploymentVersion: "Product rail set",
          versionV1: "Legacy rails",
          versionV2: "Full rail set",
          v1StatusTitle: "This event still uses the legacy rail set",
          v1StatusCause:
            "This event still runs on the legacy rail set, so the advanced business rails are not active on this show yet.",
          v1StatusImpact:
            "You still get mint, capped resale, check-in, and collectible mode, but not yet Fan-Fuel, protected FanPass supply, parametric insurance, or phygital merch.",
          v1StatusAction:
            "The sections below show the product target and the real activation status of each rail for this event.",
          railsTitle: "Ticket capability map",
          railsSubtitle:
            "This makes the product ambition legible: fan retention, protected fan access, insurance, and evolving collectibles.",
          railFanFuelTitle: "Fan-Fuel and reputation",
          railFanFuelBodyV1:
            "This show still runs on the legacy deployment: no live reputation score or spendable Fan-Fuel yet to unlock perks.",
          railFanFuelBodyV2:
            "Each purchase and attendance grows a fan score and a Fan-Fuel balance that unlocks future access.",
          railFanPassTitle: "Protected fan lane",
          railFanPassBodyV1:
            "The protected 30% lane and Soulbound-style attestations are not live on this deployment yet.",
          railFanPassBodyV2:
            "A protected slice of inventory stays reserved for the real fan base through attestations and organizer buyback.",
          railInsuranceTitle: "Parametric insurance",
          railInsuranceBodyV1:
            "Weather insurance is not live on this event yet.",
          railInsuranceBodyV2:
            "Checkout can add a premium that opens an on-chain claim when the oracle triggers coverage.",
          railResaleTitle: "Regulated resale",
          railResaleBodyV1:
            "Resale is already capped, but the continuous artist royalty is not yet surfaced as a complete upgraded rail.",
          railResaleBodyV2:
            "The secondary market becomes a legal product rail with anti-scalping caps and value sharing.",
          railCollectibleTitle: "Evolving collectible arc",
          railCollectibleBodyV1:
            "Collectible mode exists in alpha, but not yet the full burn-to-collectible progression tied to artist loyalty.",
          railCollectibleBodyV2:
            "The entry pass later transforms into an artistic souvenir that can level up across future shows.",
          railLive: "Live",
          railPartial: "Partial",
          railPlanned: "Inactive here",
          railNotLive: "Inactive here",
          railNeedsV2: "Not active on this event",
          railStatus: "Status",
          railFanTier: "Fan tier",
          railFanScore: "Score",
          railFanFuel: "Fan-Fuel",
          railFanPassSplit: "Protected allocation",
          railFanPassLeft: "Seats left",
          railInsurancePremium: "Premium",
          railOracle: "Oracle",
          railRoyalty: "Artist royalty",
          railPriceCap: "Reference price",
          railCollectibleMode: "Collectible mode",
          railMutation: "Mutation",
          railWalletProfilePending: "Fan profile pending",
          railOracleReady: "Oracle wired",
          railOracleMissing: "Oracle missing",
          railMutationReady: "Evolution planned",
          railMutationAlpha: "Alpha reveal",
          walletRequiredTitle: "Wallet required for primary checkout",
          walletRequiredCause: "No active wallet session.",
          walletRequiredImpact: "The buy block stays read-only until a wallet is connected.",
          walletRequiredAction: "Connect your wallet to continue.",
          mintPreviewLabel: "Primary purchase",
          mintPreviewDescription: "Buy one primary ticket directly from the event detail page.",
          standardPreviewLabel: "Upgraded standard checkout",
          standardPreviewDescription:
            "Buy one upgraded standard ticket with optional insurance directly from the event detail page.",
          fanPassPreviewLabel: "Protected FanPass checkout",
          fanPassPreviewDescription:
            "Buy one FanPass with a signed attestation and optional insurance directly from the event detail page.",
          mintPreviewChecks: [
            "Checks pause, supply, and wallet cap before signature.",
            "Runs a local simulation before opening the wallet.",
            "Shows a pre-check before the transaction.",
          ],
          benefitBullets: [
            "Resale stays capped by design.",
            "Verified ownership before entry.",
            "Collectible reveal after usage.",
          ],
        };

  const mintPreflight = useMemo(() => {
    if (
      !pendingPreview ||
      (pendingPreview.action?.type !== "mint" &&
        pendingPreview.action?.type !== "mint_standard" &&
        pendingPreview.action?.type !== "mint_fanpass") ||
      !pendingPreview.preflight
    ) {
      return null;
    }
    return pendingPreview.preflight;
  }, [pendingPreview]);

  const benefitBadges = getEventBenefitBadges(locale);
  const trustPoints = getEventTrustPoints(locale);
  const tabs = event
    ? getEventDetailTabs({
        locale,
        event,
        systemState,
        marketStats,
      })
    : [];
  const activeTabContent = tabs.find((tab) => tab.key === activeTab) ?? tabs[0] ?? null;
  const railCards = useMemo(
    () => [
      {
        key: "fan-fuel",
        title: copy.railFanFuelTitle,
        body: isUpgradedEvent ? copy.railFanFuelBodyV2 : copy.railFanFuelBodyV1,
        tone:
          isUpgradedEvent && event?.fanFuelBank && event?.perkManager
            ? ("success" as const)
            : isUpgradedEvent
              ? ("warning" as const)
              : ("default" as const),
        badge:
          isUpgradedEvent && event?.fanFuelBank && event?.perkManager
            ? copy.railLive
            : isUpgradedEvent
              ? copy.railPartial
              : copy.railNeedsV2,
        entries: [
          {
            label: copy.railFanTier,
            value:
              fanProfileQuery.data?.tierLabel ??
              (isUpgradedEvent ? copy.railWalletProfilePending : copy.railNotLive),
          },
          {
            label: copy.railFanScore,
            value:
              fanProfileQuery.data?.reputationScore.toString() ??
              (isUpgradedEvent ? copy.railWalletProfilePending : copy.railNotLive),
          },
          {
            label: copy.railFanFuel,
            value:
              fanProfileQuery.data?.fuelBalance.toString() ??
              (isUpgradedEvent ? copy.railWalletProfilePending : copy.railNotLive),
          },
        ],
      },
      {
        key: "fanpass",
        title: copy.railFanPassTitle,
        body: isUpgradedEvent ? copy.railFanPassBodyV2 : copy.railFanPassBodyV1,
        tone: isUpgradedEvent ? ("success" as const) : ("default" as const),
        badge: isUpgradedEvent ? copy.railLive : copy.railNeedsV2,
        entries: [
          {
            label: copy.railFanPassSplit,
            value: isUpgradedEvent ? formatBpsValue(event?.fanPassAllocationBps) : copy.railNotLive,
          },
          {
            label: copy.railFanPassLeft,
            value:
              isUpgradedEvent && fanPassRemaining !== null
                ? fanPassRemaining.toString()
                : isUpgradedEvent
                  ? "-"
                  : copy.railNotLive,
          },
          {
            label: copy.railStatus,
            value: isUpgradedEvent ? copy.modeFanPass : copy.railNeedsV2,
          },
        ],
      },
      {
        key: "insurance",
        title: copy.railInsuranceTitle,
        body: isUpgradedEvent ? copy.railInsuranceBodyV2 : copy.railInsuranceBodyV1,
        tone:
          isUpgradedEvent && insurancePremium > 0n && event?.insurancePool
            ? ("success" as const)
            : isUpgradedEvent
              ? ("warning" as const)
              : ("default" as const),
        badge:
          isUpgradedEvent && insurancePremium > 0n && event?.insurancePool
            ? copy.railLive
            : isUpgradedEvent
              ? copy.railPartial
              : copy.railNeedsV2,
        entries: [
          {
            label: copy.railInsurancePremium,
            value: isUpgradedEvent ? `${formatPol(insurancePremium)} POL` : copy.railNotLive,
          },
          {
            label: copy.railOracle,
            value:
              isUpgradedEvent && event?.oracleAdapter ? copy.railOracleReady : copy.railOracleMissing,
          },
          {
            label: copy.railStatus,
            value: isUpgradedEvent ? copy.insuranceLabel : copy.railNeedsV2,
          },
        ],
      },
      {
        key: "resale",
        title: copy.railResaleTitle,
        body: isUpgradedEvent ? copy.railResaleBodyV2 : copy.railResaleBodyV1,
        tone: isUpgradedEvent ? ("success" as const) : ("info" as const),
        badge: isUpgradedEvent ? copy.railLive : copy.railPartial,
        entries: [
          {
            label: copy.railRoyalty,
            value: isUpgradedEvent ? formatBpsValue(event?.artistRoyaltyBps) : "5.00% artist rail pending",
          },
          {
            label: copy.railPriceCap,
            value: `${formatPol(primaryPrice)} POL`,
          },
          {
            label: copy.priceLabel,
            value: marketStats?.medianPrice ? `${formatPol(marketStats.medianPrice)} POL median` : "-",
          },
        ],
      },
      {
        key: "collectible",
        title: copy.railCollectibleTitle,
        body: isUpgradedEvent ? copy.railCollectibleBodyV2 : copy.railCollectibleBodyV1,
        tone:
          isUpgradedEvent && event?.collectibleContract
            ? ("success" as const)
            : systemState?.collectibleMode
              ? ("warning" as const)
              : ("default" as const),
        badge:
          isUpgradedEvent && event?.collectibleContract
            ? copy.railLive
            : systemState?.collectibleMode
              ? copy.railPartial
              : copy.railPlanned,
        entries: [
          {
            label: copy.railCollectibleMode,
            value: systemState?.collectibleMode ? copy.active : copy.standby,
          },
          {
            label: copy.railMutation,
            value: isUpgradedEvent ? copy.railMutationReady : copy.railMutationAlpha,
          },
          {
            label: copy.railStatus,
            value: isUpgradedEvent ? copy.collectiblePreview : copy.railPartial,
          },
        ],
      },
    ],
    [
      copy,
      event?.artistRoyaltyBps,
      event?.collectibleContract,
      event?.fanFuelBank,
      event?.fanPassAllocationBps,
      event?.insurancePool,
      event?.oracleAdapter,
      event?.perkManager,
      fanPassRemaining,
      fanProfileQuery.data?.fuelBalance,
      fanProfileQuery.data?.reputationScore,
      fanProfileQuery.data?.tierLabel,
      insurancePremium,
      isUpgradedEvent,
      marketStats?.medianPrice,
      primaryPrice,
      systemState?.collectibleMode,
    ],
  );

  const onMint = async () => {
    try {
      if (!isUpgradedEvent) {
        await preparePreview({
          label: copy.mintPreviewLabel,
          description: copy.mintPreviewDescription,
          action: { type: "mint" },
          details: copy.mintPreviewChecks,
          run: (client) => client.mintPrimary(),
        });
        return;
      }

      const insuranceDetail =
        insured && insurancePremium > 0n
          ? `${copy.insuranceLabel}: +${formatPol(insurancePremium)} POL.`
          : locale === "fr"
            ? "Assurance desactivee pour cet achat."
            : "Insurance stays disabled for this checkout.";

      if (checkoutMode === "fanpass") {
        if (!walletAddress) {
          await connectWallet();
          return;
        }
        if (!bffClient) {
          setErrorMessage(copy.attestationUnavailable);
          return;
        }

        const attestation = await bffClient.getFanPassAttestation(walletAddress, event?.ticketEventId);
        setStatusMessage(copy.attestationRequested);

        await preparePreview({
          label: copy.fanPassPreviewLabel,
          description: copy.fanPassPreviewDescription,
          action: {
            type: "mint_fanpass",
            insured,
            deadline: attestation.deadline,
            signature: attestation.signature,
          },
          details: [
            locale === "fr"
              ? "Verifie l'attestation signee, le quota FanPass et le cap wallet."
              : "Checks the signed attestation, FanPass quota, and wallet cap.",
            insuranceDetail,
            locale === "fr"
              ? `Deadline attestation: ${attestation.deadline.toString()}.`
              : `Attestation deadline: ${attestation.deadline.toString()}.`,
          ],
          run: async (client) => {
            if (!client.mintFanPassTicket) {
              throw new Error("FanPass mint is unavailable in the current client.");
            }
            return client.mintFanPassTicket(attestation, insured);
          },
        });
        return;
      }

      await preparePreview({
        label: copy.standardPreviewLabel,
        description: copy.standardPreviewDescription,
        action: { type: "mint_standard", insured },
        details: [
          locale === "fr"
            ? "Verifie pause, supply standard et cap wallet avant signature."
            : "Checks pause state, standard supply, and wallet cap before signature.",
          insuranceDetail,
          locale === "fr"
            ? "Simule le mint standard upgrade avant ouverture du wallet."
            : "Runs an upgraded standard mint simulation before opening the wallet.",
        ],
        run: async (client) => {
          if (client.mintStandardTicket) {
            return client.mintStandardTicket(insured);
          }
          return client.mintPrimary();
        },
      });
    } catch (error) {
      setErrorMessage(mapEthersError(error));
    }
  };

  if (!event) {
    return (
      <div className="route-stack event-detail-route" data-testid="event-detail-page">
        <EmptyState
          title={copy.invalidTitle}
          description={copy.invalidDescription}
          action={
            <Link to="/app/explore" className="button-link primary">
              {copy.backExplore}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="route-stack event-detail-route" data-testid="event-detail-page">
      <PageHeader
        title={event.name}
        subtitle={copy.subtitle}
        workspace="explore"
        context={
          <div className="inline-actions">
            <Tag tone={isUpgradedEvent ? "success" : "warning"}>
              {isUpgradedEvent ? copy.versionV2 : copy.versionV1}
            </Tag>
            <Tag tone="default">{event.category ?? copy.validity}</Tag>
            <Tag tone="info">{formatEventStart(event.startsAt)}</Tag>
            <Tag tone="success">{formatPol(BigInt(event.primaryPriceWei))} POL</Tag>
          </div>
        }
        primaryAction={
          <ButtonGroup>
            <Link to="/app/marketplace" className="button-link ghost">
              {copy.viewMarket}
            </Link>
          </ButtonGroup>
        }
      />

      <section className="event-detail-shell">
        <Panel className="event-detail-hero-card" surface="glass">
          <div className="event-detail-hero-media">
            <EventPoster event={event} className="event-detail-poster" />
          </div>
          <div className="event-detail-hero-copy">
            <div className="inline-actions">
              {benefitBadges.map((badge) => (
                <Tag key={badge} tone="info">
                  {badge}
                </Tag>
              ))}
            </div>
            <h2>{copy.title}</h2>
            <p>
              {[event.venueName, event.city, event.countryCode].filter(Boolean).join(" | ") || event.ticketEventId}
            </p>
            <p>
              {locale === "fr"
                ? "Les infos critiques sont visibles tout de suite: date, lieu, prix, regles de revente et promesse collectible."
                : "The critical facts are visible immediately: date, venue, price, resale rules, and collectible promise."}
            </p>
            <div className="event-detail-fact-grid">
              <Card className="event-detail-fact-card" surface="quiet">
                <span>{copy.dateLabel}</span>
                <strong>{formatEventStart(event.startsAt)}</strong>
              </Card>
              <Card className="event-detail-fact-card" surface="quiet">
                <span>{copy.venueLabel}</span>
                <strong>{event.venueName ?? event.city ?? event.ticketEventId}</strong>
              </Card>
              <Card className="event-detail-fact-card" surface="quiet">
                <span>{copy.priceLabel}</span>
                <strong>{formatPol(BigInt(event.primaryPriceWei))} POL</strong>
              </Card>
              <Card className="event-detail-fact-card" surface="quiet">
                <span>{copy.walletCapLabel}</span>
                <strong>{systemState?.maxPerWallet?.toString() ?? "-"}</strong>
              </Card>
            </div>
          </div>
        </Panel>

        <aside className="event-buy-card">
          <Panel className="event-buy-panel" surface="accent">
            <p className="eyebrow">{copy.buyPanelTitle}</p>
            <h3>{formatPol(isUpgradedEvent ? totalCheckoutPrice : primaryPrice)} POL</h3>
            <p>{copy.buyPanelBody}</p>
            {isUpgradedEvent ? (
              <>
                <SegmentedToggle<"standard" | "fanpass">
                  value={checkoutMode}
                  onChange={setCheckoutMode}
                  options={[
                    { value: "standard", label: copy.modeStandard },
                    { value: "fanpass", label: copy.modeFanPass },
                  ]}
                  ariaLabel={copy.checkoutMode}
                />
                {insurancePremium > 0n ? (
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={insured}
                      onChange={(event) => setInsured(event.target.checked)}
                    />
                    <span>
                      {copy.insuranceLabel} (+{formatPol(insurancePremium)} POL)
                    </span>
                  </label>
                ) : null}
                <p>{checkoutMode === "fanpass" ? copy.attestationHint : copy.insuranceHint}</p>
                <InfoList
                  entries={[
                    {
                      label: copy.totalLabel,
                      value: `${formatPol(totalCheckoutPrice)} POL`,
                    },
                    {
                      label: copy.fanPassQuotaLabel,
                      value:
                        fanPassRemaining !== null &&
                        systemState?.fanPassSupplyCap !== undefined &&
                        systemState?.fanPassMinted !== undefined
                          ? locale === "fr"
                            ? `${fanPassRemaining.toString()} restants (${systemState.fanPassMinted.toString()} / ${systemState.fanPassSupplyCap.toString()} mintes)`
                            : `${fanPassRemaining.toString()} left (${systemState.fanPassMinted.toString()} / ${systemState.fanPassSupplyCap.toString()} minted)`
                          : "-",
                    },
                  ]}
                />
              </>
            ) : null}
            <Badge tone={mintPreflight?.ok ?? true ? "success" : "warning"} emphasis="solid">
              {mintPreflight ? (mintPreflight.ok ? copy.statusReady : copy.statusBlocked) : copy.statusReady}
            </Badge>
            <ButtonGroup>
              {walletAddress ? (
                <button type="button" className="primary" onClick={() => void onMint()}>
                  {isUpgradedEvent
                    ? checkoutMode === "fanpass"
                      ? copy.mintFanPass
                      : copy.mintStandard
                    : copy.mint}
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => void connectWallet()}>
                  {copy.connect}
                </button>
              )}
              <Link to="/app/marketplace" className="button-link ghost">
                {copy.viewMarket}
              </Link>
            </ButtonGroup>
            <ul className="event-buy-list">
              {copy.benefitBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </Panel>

          <Card className="event-buy-panel" surface="glass">
            <h3>{copy.txTitle}</h3>
            <p>{txState.label ?? copy.txFallback}</p>
            <div className="inline-actions">
              <Tag tone={txState.status === "error" ? "danger" : txState.status === "success" ? "success" : "default"}>
                {txState.status}
              </Tag>
              {txState.hash ? <Tag tone="info">{txState.hash.slice(0, 10)}</Tag> : null}
            </div>
          </Card>
        </aside>
      </section>

      <EventDemoNotice event={event} />

      {!isUpgradedEvent ? (
        <RiskBanner
          tone="warning"
          title={copy.v1StatusTitle}
          cause={copy.v1StatusCause}
          impact={copy.v1StatusImpact}
          action={copy.v1StatusAction}
        />
      ) : null}

      {!walletAddress ? (
        <RiskBanner
          tone="warning"
          title={copy.walletRequiredTitle}
          cause={copy.walletRequiredCause}
          impact={copy.walletRequiredImpact}
          action={copy.walletRequiredAction}
        />
      ) : null}

      <section className="event-trust-shell">
        <SectionHeader title={copy.railsTitle} subtitle={copy.railsSubtitle} />
        <div className="event-trust-grid">
          {railCards.map((rail) => (
            <Card key={rail.key} className="event-trust-card" surface="glass">
              <div className="inline-actions">
                <h3>{rail.title}</h3>
                <Badge tone={rail.tone}>{rail.badge}</Badge>
              </div>
              <p>{rail.body}</p>
              <InfoList entries={rail.entries} />
            </Card>
          ))}
        </div>
      </section>

      <section className="event-trust-shell">
        <SectionHeader title={copy.whySafer} subtitle={copy.whySaferBody} />
        <div className="event-trust-grid">
          {trustPoints.map((point) => (
            <Card key={point.title} className="event-trust-card" surface="glass">
              <h3>{point.title}</h3>
              <p>{point.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {activeTabContent ? (
        <Panel className="event-tab-shell" surface="glass">
          <SegmentedToggle<EventDetailTabKey>
            value={activeTab}
            onChange={setActiveTab}
            options={tabs.map((tab) => ({ value: tab.key, label: tab.label }))}
            ariaLabel="Event detail sections"
          />
          <Card className="event-tab-card" surface="quiet">
            <h3>{activeTabContent.title}</h3>
            <p>{activeTabContent.lead}</p>
            <ul className="plain-list">
              {activeTabContent.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </Card>
        </Panel>
      ) : null}
    </div>
  );
}
