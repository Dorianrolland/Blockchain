import { useMemo } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  EmptyState,
  InfoList,
  PageHeader,
  Panel,
  SegmentedToggle,
  Tag,
} from "../components/ui/Primitives";
import { EventDemoNotice } from "../components/events/EventDemoNotice";
import { TicketMedia } from "../components/tickets/TicketMedia";
import { TicketQrPanel } from "../components/tickets/TicketQrPanel";
import { IndexedReadinessBanner } from "../components/layout/IndexedReadinessBanner";
import { useI18n } from "../i18n/I18nContext";
import { createBffClient } from "../lib/bffClient";
import { getCollectibleByIdFromChain } from "../lib/collectibles";
import { TICKET_NFT_ABI } from "../lib/abi";
import { mapEthersError } from "../lib/errors";
import { formatAddress, formatEventStart, formatPol, formatTimestamp } from "../lib/format";
import { buildTokenUriFromBase } from "../lib/ticketMetadata";
import { parseTokenIdInput, timelineLabel } from "../lib/timeline";
import { getTicketPerks, getTicketStateLabel } from "../lib/workspaceContent";
import { useTicketPreviewCollection } from "../lib/useTicketPreviewCollection";
import { useAppState } from "../state/useAppState";
import type { Locale } from "../i18n/messages";
import type { TicketTimelineEntry } from "../types/chainticket";

function phaseForEntry(entry: TicketTimelineEntry, locale: Locale): string {
  if (entry.kind === "mint") {
    return locale === "fr" ? "Mint" : "Mint";
  }
  if (entry.kind === "listed" || entry.kind === "cancelled") {
    return locale === "fr" ? "Revente" : "Listing";
  }
  if (entry.kind === "sold" || entry.kind === "transfer") {
    return locale === "fr" ? "Propriete" : "Ownership";
  }
  if (entry.kind === "used") {
    return locale === "fr" ? "Usage" : "Usage";
  }
  return locale === "fr" ? "Metadonnees" : "Metadata";
}

function phaseBadgeLabel(entry: TicketTimelineEntry, locale: Locale): string {
  switch (entry.kind) {
    case "mint":
      return locale === "fr" ? "MINT" : "MINT";
    case "listed":
      return locale === "fr" ? "LISTE" : "LISTED";
    case "sold":
      return locale === "fr" ? "VENDU" : "SOLD";
    case "used":
      return locale === "fr" ? "UTILISE" : "USED";
    case "cancelled":
      return locale === "fr" ? "ANNULE" : "CANCELLED";
    case "transfer":
      return locale === "fr" ? "TRANSFERT" : "TRANSFER";
    default:
      return locale === "fr" ? "MISE A JOUR" : "UPDATE";
  }
}

function phaseBadgeTone(entry: TicketTimelineEntry): "success" | "info" | "warning" | "default" {
  switch (entry.kind) {
    case "mint":
      return "success";
    case "listed":
    case "sold":
      return "info";
    case "used":
      return "warning";
    default:
      return "default";
  }
}

export function TicketDetailPage() {
  const { locale, t } = useI18n();
  const { tokenId: tokenIdParam } = useParams<{ tokenId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    fetchTicketTimeline,
    contractConfig,
    indexedReadsAvailable,
    runtimeConfig,
    tickets,
    systemState,
    selectedEventName,
    watchlist,
    toggleWatch,
    availableEvents,
    selectedEventId,
    walletAddress,
    preparePreview,
    setErrorMessage,
  } = useAppState();
  const selectedEvent =
    (availableEvents ?? []).find((event) => event.ticketEventId === selectedEventId) ?? null;
  const bffClient = useMemo(
    () => createBffClient(runtimeConfig?.apiBaseUrl ?? null),
    [runtimeConfig?.apiBaseUrl],
  );
  const tokenId = tokenIdParam ? parseTokenIdInput(tokenIdParam) : null;
  const ticket = useMemo(
    () =>
      tokenId === null
        ? null
        : tickets.find((candidate) => candidate.tokenId === tokenId) ?? null,
    [tickets, tokenId],
  );
  const requestedViewParam = searchParams.get("view");
  const collectibleIdParam = searchParams.get("collectibleId");
  const collectibleId = collectibleIdParam ? parseTokenIdInput(collectibleIdParam) : null;
  const displayView: "live" | "collectible" =
    requestedViewParam === "collectible"
      ? "collectible"
      : requestedViewParam === "live"
        ? "live"
        : systemState?.collectibleMode
          ? "collectible"
          : "live";
  const eventWatchKey =
    tokenId !== null
      ? `${contractConfig.eventId ?? "main-event"}:${tokenId.toString()}`
      : null;

  const timelineQuery = useQuery({
    queryKey: ["ticket-timeline", tokenId?.toString() ?? "none"],
    enabled: tokenId !== null,
    queryFn: async () => {
      if (tokenId === null) {
        return [];
      }
      return fetchTicketTimeline(tokenId);
    },
  });
  const coverageQuery = useQuery({
    queryKey: [
      "ticket-coverage",
      selectedEventId,
      tokenId?.toString() ?? "none",
      runtimeConfig?.apiBaseUrl ?? "no-bff",
    ],
    enabled: tokenId !== null && (selectedEvent?.version ?? "v1") === "v2",
    retry: 1,
    queryFn: async () => {
      if (tokenId === null) {
        throw new Error("Coverage unavailable without a token id.");
      }

      if (bffClient) {
        try {
          return await bffClient.getTicketCoverage(tokenId, selectedEventId);
        } catch {
          // Fall back to direct RPC reads for V2 coverage.
        }
      }

      const provider = new JsonRpcProvider(contractConfig.rpcUrl, contractConfig.chainId);
      const ticketContract = new Contract(contractConfig.ticketNftAddress, TICKET_NFT_ABI, provider);
      const coverage = await ticketContract.coverageOf(tokenId);

      return {
        ticketEventId: selectedEventId,
        tokenId,
        supported: true,
        insured: Boolean(coverage[0]),
        claimed: Boolean(coverage[1]),
        claimable: Boolean(coverage[2]),
        payoutBps: Number(coverage[3] ?? 0),
        weatherRoundId: BigInt(coverage[4] ?? 0),
        premiumPaid: BigInt(coverage[5] ?? 0),
        payoutAmount: BigInt(coverage[6] ?? 0),
        policyActive: Boolean(coverage[2]) || Number(coverage[3] ?? 0) > 0,
        reportHash: null,
      };
    },
  });
  const collectibleQuery = useQuery({
    queryKey: [
      "collectible-detail",
      selectedEventId,
      collectibleId?.toString() ?? "none",
      selectedEvent?.collectibleContract ?? "no-collectible",
    ],
    enabled:
      collectibleId !== null &&
      (selectedEvent?.version ?? "v1") === "v2" &&
      Boolean(selectedEvent?.collectibleContract),
    retry: 1,
    queryFn: async () => {
      if (collectibleId === null) {
        throw new Error("Collectible unavailable without a collectible id.");
      }

      return getCollectibleByIdFromChain({
        rpcUrl: contractConfig.rpcUrl,
        chainId: contractConfig.chainId,
        collectibleContractAddress: selectedEvent!.collectibleContract!,
        collectibleId,
      });
    },
  });
  const liveTokenUri =
    tokenId !== null
      ? buildTokenUriFromBase(systemState?.baseTokenURI, tokenId) ??
        (!systemState?.collectibleMode ? ticket?.tokenURI ?? null : null)
      : null;
  const collectibleTokenUri =
    collectibleQuery.data?.tokenURI ??
    (tokenId !== null
      ? buildTokenUriFromBase(systemState?.collectibleBaseURI, tokenId) ??
        (systemState?.collectibleMode ? ticket?.tokenURI ?? null : null)
      : null);
  const activeTokenUri =
    displayView === "collectible"
      ? collectibleTokenUri ?? ticket?.tokenURI ?? liveTokenUri ?? ""
      : ticket?.tokenURI ?? liveTokenUri ?? collectibleTokenUri ?? "";
  const previewDescriptors = useMemo(
    () =>
      tokenId !== null && activeTokenUri
        ? [
            {
              key: tokenId.toString(),
              tokenId,
              ticketEventId: contractConfig.eventId,
              activeTokenUri,
              activeView: displayView,
              liveTokenUri,
              collectibleTokenUri,
            },
          ]
        : [],
    [
      activeTokenUri,
      collectibleTokenUri,
      contractConfig.eventId,
      displayView,
      liveTokenUri,
      tokenId,
    ],
  );
  const previews = useTicketPreviewCollection(previewDescriptors);
  const preview = tokenId !== null ? previews.get(tokenId.toString()) : null;
  const collectibleReady = Boolean(preview?.collectibleTokenUri) && !systemState?.collectibleMode;
  const stateLabel =
    ticket && tokenId !== null
      ? getTicketStateLabel({
          locale,
          ticket,
          collectibleMode: Boolean(systemState?.collectibleMode),
          collectibleReady,
        })
      : null;

  const grouped = useMemo(() => {
    const groups = new Map<string, TicketTimelineEntry[]>();
    for (const entry of timelineQuery.data ?? []) {
      const phase = phaseForEntry(entry, locale);
      const current = groups.get(phase) ?? [];
      current.push(entry);
      groups.set(phase, current);
    }
    return [...groups.entries()];
  }, [locale, timelineQuery.data]);

  const selectedMetadata =
    displayView === "collectible"
      ? preview?.collectibleMetadata ?? preview?.activeMetadata ?? null
      : preview?.liveMetadata ?? preview?.activeMetadata ?? null;
  const selectedMedia =
    displayView === "collectible"
      ? preview?.collectibleMedia ?? preview?.activeMedia
      : preview?.liveMedia ?? preview?.activeMedia;
  const selectedQrValue =
    collectibleId !== null && displayView === "collectible"
      ? null
      : displayView === "collectible"
      ? preview?.collectibleQrValue ?? preview?.liveQrValue
      : preview?.liveQrValue ?? preview?.collectibleQrValue;
  const eventMoment = formatEventStart(selectedEvent?.startsAt ?? null);
  const tokenLabel = tokenId !== null ? `#${tokenId.toString()}` : "#-";
  const collectibleLabel = collectibleId !== null ? `#${collectibleId.toString()}` : null;
  const eventLocation = [selectedEvent?.venueName, selectedEvent?.city, selectedEvent?.countryCode]
    .filter(Boolean)
    .join(" | ");
  const compactEventLocation = eventLocation;
  const passHeadline =
    selectedMetadata?.name ??
    (collectibleId !== null
      ? `Collectible #${collectibleId.toString()}`
      : selectedEventName || contractConfig.eventName || `Ticket ${tokenLabel}`);
  const headerTitle = selectedEventName || contractConfig.eventName || passHeadline;
  const heroTitle =
    displayView === "collectible"
      ? locale === "fr"
        ? "Souvenir collectible"
        : "Collectible souvenir"
      : locale === "fr"
        ? "Pass d'entree mobile"
        : "Mobile entry pass";
  const copy =
    locale === "fr"
      ? {
          invalidToken: "Token invalide",
          invalidDescription: "Le format du token id n'est pas valide.",
          subtitle:
            "La page phare du produit: pass hero, statut lisible, QR bien visible, perks et preuve de cycle de vie a la demande.",
          collectibleLive: "Collectible actif",
          collectiblePreview: "Apercu collectible",
          listedOnMarket: "Liste sur le marche",
          delayedTitle: "Timeline indexee en attente",
          delayedImpact:
            "Les donnees du pass restent visibles en lecture directe on-chain pendant que la timeline enrichie se resynchronise.",
          premiumPass: "Pass premium",
          chainEvent: "Evenement ChainTicket",
          heroFallback:
            "Un pass d'entree premium, lisible en quelques secondes, avec les details avances ranges plus bas quand on en a besoin.",
          livePass: "Pass live",
          collectibleMode: "Collectible",
          ticketMode: "Mode billet",
          metadataFallback: "Fallback metadonnees",
          loadingMedia: "Chargement media",
          qrTitle: "QR d'entree mobile",
          qrSubtitle: "Pret pour le scanner terrain et la resolution manuelle en secours.",
          tokenLabel: "Token",
          ownerLabel: "Proprietaire",
          listingLabel: "Annonce",
          notListed: "Non liste",
          collectibleStatus: "Mode collectible",
          active: "Actif",
          standby: "En attente",
          statusLabel: "Statut",
          manageResale: "Gerer la revente",
          passReady: "Pass pret",
          passSnapshot: "Essentiel du pass",
          passSnapshotSubtitle: "Seulement ce qu'il faut voir immediatement.",
          passDetailsTitle: "Details du pass",
          passDetailsSubtitle: "Ouvrir seulement si vous avez besoin du detail complet.",
          insuranceSubtitle: "Prime, police et remboursement sans encombrer l'ecran principal.",
          lifecycleAccordionSubtitle: "Mint, revente et usage ranges dans une vue preuve a la demande.",
          heroLiveCaption:
            "Conservez un ecran propre: le visuel, le QR et le statut font le travail, le reste reste en retrait.",
          heroCollectibleCaption:
            "Le souvenir prend le devant de la scene, tandis que les metadonnees et preuves restent consultables a la demande.",
          timelineLoadingTitle: "Chargement de la timeline",
          lifecycleTitle: "Preuve de cycle de vie",
          lifecycleSubtitle: "Mint, revente, usage et metadonnees regroupes par phase pour ne pas surcharger le hero.",
          insuranceTitle: "Assurance meteo",
          insuranceInactive: "Non assure",
          insuranceActive: "Assure",
          insuranceClaimable: "Remboursement ouvert",
          insuranceClaimed: "Rembourse",
          premiumLabel: "Prime",
          payoutLabel: "Remboursement potentiel",
          roundLabel: "Round oracle",
          policyLabel: "Police",
          claimInsurance: "Declarer le remboursement",
          claimInsuranceDescription:
            "Soumettre le claim on-chain sur le pool d'assurance quand la couverture meteo est ouverte.",
          claimInsuranceHelp:
            "Verifie la propriete du billet, la fenetre de remboursement et tente de verser le payout au wallet courant.",
          collectibleIdLabel: "Collectible",
          sourceTicketLabel: "Ticket source",
          collectibleLevelLabel: "Niveau",
        }
      : {
          invalidToken: "Invalid token",
          invalidDescription: "Token id format is not valid.",
          subtitle:
            "The product hero page: pass-first visual, readable status, visible QR, perks, and lifecycle proof on demand.",
          collectibleLive: "Collectible live",
          collectiblePreview: "Collectible preview",
          listedOnMarket: "Listed on market",
          delayedTitle: "Indexed timeline delayed",
          delayedImpact: "Pass data stays visible from direct chain reads while indexed lifecycle enrichment catches up.",
          premiumPass: "Premium pass",
          chainEvent: "ChainTicket event",
          heroFallback:
            "A premium entry credential that reads in seconds, with deeper proof and metadata tucked away until needed.",
          livePass: "Live pass",
          collectibleMode: "Collectible",
          ticketMode: "Ticket mode",
          metadataFallback: "Metadata fallback",
          loadingMedia: "Loading media",
          qrTitle: "Mobile entry QR",
          qrSubtitle: "Ready for scanner mode and fallback ticket resolution.",
          tokenLabel: "Token",
          ownerLabel: "Owner",
          listingLabel: "Listing",
          notListed: "Not listed",
          collectibleStatus: "Collectible mode",
          active: "Active",
          standby: "Standby",
          statusLabel: "Status",
          manageResale: "Manage resale",
          passReady: "Pass ready",
          passSnapshot: "Pass essentials",
          passSnapshotSubtitle: "Only the information that matters right now.",
          passDetailsTitle: "Pass details",
          passDetailsSubtitle: "Open only when you want the full ticket breakdown.",
          insuranceSubtitle: "Premium, policy, and payout tucked away from the main canvas.",
          lifecycleAccordionSubtitle: "Mint, resale, and usage proof grouped into a quiet evidence layer.",
          heroLiveCaption:
            "Keep the screen clean: the artwork, QR, and status do the work while deeper details stay backstage.",
          heroCollectibleCaption:
            "The souvenir takes center stage while metadata and proof remain available on demand.",
          timelineLoadingTitle: "Loading timeline",
          lifecycleTitle: "Lifecycle proof",
          lifecycleSubtitle: "Mint, resale, usage, and metadata events grouped by phase instead of crowding the hero.",
          insuranceTitle: "Weather insurance",
          insuranceInactive: "Uninsured",
          insuranceActive: "Insured",
          insuranceClaimable: "Claimable",
          insuranceClaimed: "Claimed",
          premiumLabel: "Premium",
          payoutLabel: "Potential payout",
          roundLabel: "Oracle round",
          policyLabel: "Policy",
          claimInsurance: "Claim payout",
          claimInsuranceDescription:
            "Submit the on-chain insurance claim when the weather coverage window is open.",
          claimInsuranceHelp:
            "Checks ticket ownership, verifies the open payout window, and attempts to send the insurance payout to the connected wallet.",
          collectibleIdLabel: "Collectible",
          sourceTicketLabel: "Source ticket",
          collectibleLevelLabel: "Level",
        };

  const onClaimInsurance = async () => {
    if (tokenId === null) {
      return;
    }

    try {
      await preparePreview({
        label: copy.claimInsurance,
        description: copy.claimInsuranceDescription,
        action: { type: "claim_insurance", tokenId },
        details: [
          locale === "fr"
            ? "Controle que le billet est assure et que le payout oracle est actif."
            : "Checks that the ticket is insured and the oracle payout window is active.",
          locale === "fr"
            ? "Verifie que le wallet connecte est bien le proprietaire du billet."
            : "Verifies the connected wallet is the current ticket owner.",
          copy.claimInsuranceHelp,
        ],
        run: async (client) => {
          if (!client.claimInsurance) {
            throw new Error(
              locale === "fr"
                ? "Le claim assurance est indisponible dans ce client."
                : "Insurance claim is unavailable in this client.",
            );
          }
          return client.claimInsurance(tokenId);
        },
      });
    } catch (error) {
      setErrorMessage(mapEthersError(error));
    }
  };

  if (tokenId === null) {
    return (
      <div className="route-stack ticket-detail-route" data-testid="ticket-detail-page">
        <EmptyState title={copy.invalidToken} description={copy.invalidDescription} />
      </div>
    );
  }

  return (
    <div className="route-stack ticket-detail-route detail-vault-route" data-testid="ticket-detail-page">
      <PageHeader
        title={headerTitle}
        subtitle={[displayView === "collectible" ? copy.collectibleMode : copy.livePass, eventMoment, compactEventLocation].filter(Boolean).join(" | ")}
        workspace="tickets"
        context={
          <div className="inline-actions">
            {stateLabel ? <Tag tone={ticket?.used ? "warning" : ticket?.listed ? "info" : "success"}>{stateLabel}</Tag> : null}
            {collectibleQuery.data ? (
              <Tag tone="info">
                {copy.collectibleLevelLabel} {collectibleQuery.data.level.toString()}
              </Tag>
            ) : null}
          </div>
        }
        primaryAction={
          <Link to="/app/tickets" className="button-link ghost">
            {t("myTicketsTitle")}
          </Link>
        }
        secondaryActions={
          tokenId !== null ? (
            <ButtonGroup compact>
              <button type="button" className="ghost" onClick={() => toggleWatch(tokenId)}>
                {eventWatchKey && watchlist.has(eventWatchKey) ? t("unwatch") : t("watch")}
              </button>
            </ButtonGroup>
          ) : null
        }
      />

      <EventDemoNotice event={selectedEvent} />

      {!indexedReadsAvailable ? (
        <IndexedReadinessBanner
          title={copy.delayedTitle}
          impact={copy.delayedImpact}
        />
      ) : null}

      <section className="ticket-detail-shell">
        <Panel className="ticket-detail-main-card ticket-detail-hero-shell" surface="glass">
          <div className="ticket-detail-pass-top">
            <div className="ticket-detail-pass-intro">
              <p className="eyebrow">{copy.premiumPass}</p>
              <h2>{heroTitle}</h2>
              <div className="ticket-detail-hero-meta">
                <span>{passHeadline}</span>
                <span>{eventMoment}</span>
                {compactEventLocation ? <span>{compactEventLocation}</span> : null}
                <span>
                  {collectibleId !== null
                    ? `${copy.sourceTicketLabel} ${tokenLabel}`
                    : `${copy.tokenLabel} ${tokenLabel}`}
                </span>
              </div>
              <p className="ticket-detail-caption">
                {displayView === "collectible" ? copy.heroCollectibleCaption : copy.heroLiveCaption}
              </p>
            </div>
            <div className="ticket-detail-pass-controls">
              {stateLabel ? (
                <Tag tone={ticket?.used ? "warning" : ticket?.listed ? "info" : "success"}>
                  {stateLabel}
                </Tag>
              ) : null}
              {preview?.liveTokenUri && preview?.collectibleTokenUri ? (
                <SegmentedToggle<"live" | "collectible">
                  value={displayView}
                  onChange={(next) => {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.set("view", next);
                    setSearchParams(nextParams, { replace: true });
                  }}
                  options={[
                    { value: "live", label: copy.livePass },
                    { value: "collectible", label: copy.collectibleMode },
                  ]}
                  ariaLabel="Ticket pass preview mode"
                />
              ) : null}
            </div>
          </div>

          <div className="ticket-detail-pass-grid">
            <Card className="ticket-detail-artwork-card ticket-detail-stage-card" surface="accent">
              <TicketMedia
                media={
                  selectedMedia ?? {
                    kind: "fallback",
                    src: null,
                    posterSrc: null,
                    alt:
                      collectibleId !== null
                        ? `Collectible #${collectibleId.toString()}`
                        : `Ticket ${tokenLabel}`,
                  }
                }
                fallbackTitle={selectedEventName || "ChainTicket admission"}
                fallbackSubtitle={
                  collectibleId !== null
                    ? `Collectible #${collectibleId.toString()}`
                    : `Token ${tokenLabel}`
                }
                fallbackEyebrow={displayView === "collectible" ? copy.collectibleMode : copy.livePass}
                className="ticket-detail-media"
              />
              <div className="ticket-detail-media-meta">
                <Badge tone={displayView === "collectible" ? "info" : "default"} emphasis="solid">
                  {displayView === "collectible" ? copy.collectibleMode : copy.ticketMode}
                </Badge>
                {preview?.isLoading ? <Tag tone="default">{copy.loadingMedia}</Tag> : null}
                {preview?.errorMessage ? <Tag tone="warning">{copy.metadataFallback}</Tag> : null}
              </div>
            </Card>

            <div className="ticket-detail-side ticket-detail-summary-stack sticky-stack">
              {selectedQrValue ? (
                <TicketQrPanel
                  value={selectedQrValue}
                  title={copy.qrTitle}
                  subtitle={copy.qrSubtitle}
                  className="ticket-detail-access-card"
                />
              ) : null}

              <Card className="ticket-detail-facts ticket-detail-summary-card" surface="glass">
                <div className="ticket-detail-summary-head">
                  <div>
                    <p className="eyebrow">{copy.passSnapshot}</p>
                    <h3>{passHeadline}</h3>
                    <p>{copy.passSnapshotSubtitle}</p>
                  </div>
                  {collectibleQuery.data ? (
                    <Tag tone="info">
                      {copy.collectibleLevelLabel} {collectibleQuery.data.level.toString()}
                    </Tag>
                  ) : null}
                </div>
                <InfoList
                  entries={[
                    {
                      label: copy.statusLabel,
                      value:
                        collectibleQuery.data
                          ? `${copy.collectibleMode} L${collectibleQuery.data.level.toString()}`
                          : stateLabel ?? "-",
                    },
                    {
                      label: copy.ownerLabel,
                      value: collectibleQuery.data
                        ? formatAddress(collectibleQuery.data.owner)
                        : ticket
                          ? formatAddress(ticket.owner)
                          : "Timeline view",
                    },
                    {
                      label: copy.listingLabel,
                      value:
                        ticket?.listed && ticket.listingPrice
                          ? `${formatPol(ticket.listingPrice)} POL`
                          : copy.notListed,
                    },
                  ]}
                />
                <div className="ticket-detail-side-actions">
                  <Link
                    to={
                      ticket?.listed
                        ? "/app/marketplace"
                        : `/app/tickets/${tokenId.toString()}${collectibleReady ? "?view=collectible" : ""}`
                    }
                    className="button-link primary"
                  >
                    {ticket?.listed ? copy.manageResale : collectibleReady ? copy.collectiblePreview : copy.passReady}
                  </Link>
                </div>
              </Card>
            </div>
          </div>

          <div className="ticket-detail-accordion-grid">
            <DetailAccordion
              title={copy.passDetailsTitle}
              subtitle={copy.passDetailsSubtitle}
              className="ticket-detail-accordion"
            >
              <div className="ticket-detail-detail-grid">
                <InfoList
                  entries={[
                    { label: copy.tokenLabel, value: tokenLabel },
                    {
                      label: copy.collectibleIdLabel,
                      value: collectibleLabel ?? "-",
                    },
                    {
                      label: copy.sourceTicketLabel,
                      value: collectibleQuery.data
                        ? `#${collectibleQuery.data.sourceTicketId.toString()}`
                        : tokenLabel,
                    },
                    {
                      label: copy.ownerLabel,
                      value: collectibleQuery.data
                        ? formatAddress(collectibleQuery.data.owner)
                        : ticket
                          ? formatAddress(ticket.owner)
                          : "Timeline view",
                    },
                    {
                      label: copy.listingLabel,
                      value:
                        ticket?.listed && ticket.listingPrice
                          ? `${formatPol(ticket.listingPrice)} POL`
                          : copy.notListed,
                    },
                    {
                      label: copy.collectibleStatus,
                      value:
                        displayView === "collectible" || systemState?.collectibleMode
                          ? copy.active
                          : copy.standby,
                    },
                    {
                      label: copy.statusLabel,
                      value:
                        collectibleQuery.data
                          ? `${copy.collectibleMode} L${collectibleQuery.data.level.toString()}`
                          : stateLabel ?? "-",
                    },
                  ]}
                />
                <div className="ticket-detail-detail-stack">
                  <div className="ticket-detail-attribute-grid">
                    {getTicketPerks(locale).map((perk) => (
                      <div key={perk} className="ticket-attribute-chip">
                        <span>Perk</span>
                        <strong>{perk}</strong>
                      </div>
                    ))}
                    {(selectedMetadata?.attributes ?? []).map((attribute) => (
                      <div key={`${attribute.traitType}-${attribute.value}`} className="ticket-attribute-chip">
                        <span>{attribute.traitType}</span>
                        <strong>{attribute.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </DetailAccordion>

            {coverageQuery.data?.supported ? (
              <DetailAccordion
                title={copy.insuranceTitle}
                subtitle={copy.insuranceSubtitle}
                className="ticket-detail-accordion"
              >
                <div className="ticket-detail-insurance-card">
                  <div className="inline-actions">
                    <Tag
                      tone={
                        coverageQuery.data.claimed
                          ? "info"
                          : coverageQuery.data.claimable
                            ? "success"
                            : coverageQuery.data.insured
                              ? "warning"
                              : "default"
                      }
                    >
                      {coverageQuery.data.claimed
                        ? copy.insuranceClaimed
                        : coverageQuery.data.claimable
                          ? copy.insuranceClaimable
                          : coverageQuery.data.insured
                            ? copy.insuranceActive
                            : copy.insuranceInactive}
                    </Tag>
                  </div>
                  <InfoList
                    entries={[
                      { label: copy.policyLabel, value: coverageQuery.data.policyActive ? copy.active : copy.standby },
                      { label: copy.premiumLabel, value: `${formatPol(coverageQuery.data.premiumPaid)} POL` },
                      { label: copy.payoutLabel, value: `${formatPol(coverageQuery.data.payoutAmount)} POL` },
                      { label: copy.roundLabel, value: coverageQuery.data.weatherRoundId.toString() },
                    ]}
                  />
                  {coverageQuery.data.claimable && walletAddress ? (
                    <div className="ticket-detail-side-actions">
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void onClaimInsurance()}
                      >
                        {copy.claimInsurance}
                      </button>
                    </div>
                  ) : null}
                </div>
              </DetailAccordion>
            ) : null}

            <DetailAccordion
              title={copy.lifecycleTitle}
              subtitle={copy.lifecycleAccordionSubtitle}
              className="ticket-detail-accordion"
            >
              {timelineQuery.isLoading ? (
                <p className="ticket-detail-muted-copy">{copy.timelineLoadingTitle}</p>
              ) : (timelineQuery.data?.length ?? 0) === 0 ? (
                <div className="ticket-detail-empty-inline">
                  <p>{t("emptyTimelineReason")}</p>
                  <Link to="/app/tickets" className="button-link ghost">
                    {t("myTicketsTitle")}
                  </Link>
                </div>
              ) : (
                <div className="ticket-detail-lifecycle-stack">
                  {grouped.length > 0 ? (
                    <section className="phase-summary">
                      <p className="ticket-detail-muted-copy">{copy.lifecycleSubtitle}</p>
                      <div className="phase-summary-chips">
                        {grouped.map(([phase, entries]) => (
                          <Tag key={phase} tone="info" className="phase-chip">
                            {phase}: {entries.length}
                          </Tag>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="timeline-list">
                    {(timelineQuery.data ?? []).map((entry) => (
                      <Card key={entry.id} className="timeline-item" surface="quiet">
                        <div className="timeline-marker" aria-hidden="true" />
                        <div className="timeline-content">
                          <header>
                            <h3>{timelineLabel(entry.kind)}</h3>
                            <div className="inline-actions">
                              <Badge tone={phaseBadgeTone(entry)}>{phaseBadgeLabel(entry, locale)}</Badge>
                              <Badge tone="info">
                                {entry.timestamp ? formatTimestamp(entry.timestamp * 1000) : `Block ${entry.blockNumber}`}
                              </Badge>
                            </div>
                          </header>
                          <p>{entry.description}</p>
                          <a href={`${contractConfig.explorerTxBaseUrl}${entry.txHash}`} target="_blank" rel="noreferrer">
                            {formatAddress(entry.txHash, 8)}
                          </a>
                        </div>
                      </Card>
                    ))}
                  </section>
                </div>
              )}
            </DetailAccordion>
          </div>
        </Panel>
      </section>
    </div>
  );
}
