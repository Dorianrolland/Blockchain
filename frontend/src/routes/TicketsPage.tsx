import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  Badge,
  Card,
  DetailAccordion,
  EmptyState,
  InfoList,
  PageHeader,
  Panel,
  ProgressStepper,
  SectionHeader,
  SegmentedToggle,
  Tag,
} from "../components/ui/Primitives";
import { EventDemoNotice } from "../components/events/EventDemoNotice";
import { TicketMedia } from "../components/tickets/TicketMedia";
import { IndexedReadinessBanner } from "../components/layout/IndexedReadinessBanner";
import { useI18n } from "../i18n/I18nContext";
import { createBffClient } from "../lib/bffClient";
import { getCollectiblesByOwnerFromChain } from "../lib/collectibles";
import { mapEthersError } from "../lib/errors";
import { formatAddress, formatPol } from "../lib/format";
import { getMerchCatalogFromChain, getMerchRedemptionsByFanFromChain } from "../lib/merch";
import { getPerksForFanFromChain } from "../lib/perks";
import { buildTokenUriFromBase } from "../lib/ticketMetadata";
import {
  getTicketPerks,
  getTicketStateLabel,
} from "../lib/workspaceContent";
import { useTicketPreviewCollection } from "../lib/useTicketPreviewCollection";
import { useAppState } from "../state/useAppState";

type TicketViewMode = "card" | "table";

function perkDisplayName(perkId: string, metadataURI: string): string {
  if (metadataURI.trim().length > 0) {
    const sanitized = metadataURI.split("?")[0]?.split("#")[0] ?? metadataURI;
    const lastSegment = sanitized.split("/").filter(Boolean).pop() ?? sanitized;
    const withoutExtension = lastSegment.replace(/\.json$/i, "");
    if (withoutExtension.length > 0) {
      return withoutExtension.replace(/[-_]/g, " ");
    }
  }

  return `${perkId.slice(0, 10)}...`;
}

function resolvePreviewDescriptor(args: {
  tokenId: bigint;
  eventId?: string;
  tokenUri: string;
  collectibleMode: boolean;
  baseTokenURI?: string;
  collectibleBaseURI?: string;
}) {
  const liveTokenUri = buildTokenUriFromBase(args.baseTokenURI, args.tokenId);
  const collectibleTokenUri = buildTokenUriFromBase(args.collectibleBaseURI, args.tokenId);

  return {
    activeTokenUri: args.tokenUri,
    activeView: args.collectibleMode ? ("collectible" as const) : ("live" as const),
    liveTokenUri: liveTokenUri ?? (args.collectibleMode ? null : args.tokenUri),
    collectibleTokenUri: collectibleTokenUri ?? (args.collectibleMode ? args.tokenUri : null),
    ticketEventId: args.eventId,
  };
}

export function TicketsPage() {
  const { locale, t } = useI18n();
  const {
    tickets,
    walletAddress,
    watchlist,
    toggleWatch,
    refreshDashboard,
    connectWallet,
    contractConfig,
    indexedReadsAvailable,
    runtimeConfig,
    systemState,
    selectedEventName,
    availableEvents,
    selectedEventId,
    preparePreview,
    setErrorMessage,
    txState,
  } = useAppState();
  const selectedEvent =
    (availableEvents ?? []).find((event) => event.ticketEventId === selectedEventId) ?? null;
  const bffClient = useMemo(
    () => createBffClient(runtimeConfig?.apiBaseUrl ?? null),
    [runtimeConfig?.apiBaseUrl],
  );
  const preferBffV2Reads = Boolean(bffClient && indexedReadsAvailable);
  const [viewMode, setViewMode] = useState<TicketViewMode>("card");
  const eventWatchKey = (tokenId: bigint) =>
    `${contractConfig.eventId ?? "main-event"}:${tokenId.toString()}`;
  const fanProfileQuery = useQuery({
    queryKey: [
      "fan-profile",
      selectedEventId,
      walletAddress,
      runtimeConfig?.apiBaseUrl ?? "no-bff",
    ],
    enabled: Boolean(
      bffClient &&
      walletAddress &&
      indexedReadsAvailable &&
      (selectedEvent?.version ?? "v1") === "v2",
    ),
    retry: 1,
    refetchInterval: 30_000,
    queryFn: async () => bffClient!.getFanProfile(walletAddress, selectedEventId),
  });
  const collectiblesQuery = useQuery({
    queryKey: [
      "collectibles",
      selectedEventId,
      walletAddress,
      selectedEvent?.collectibleContract ?? "no-collectible",
      preferBffV2Reads ? runtimeConfig?.apiBaseUrl ?? "bff" : "chain",
    ],
    enabled: Boolean(walletAddress && selectedEvent?.collectibleContract && (selectedEvent?.version ?? "v1") === "v2"),
    retry: 1,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (preferBffV2Reads && bffClient && walletAddress) {
        try {
          return await bffClient.getFanCollectibles(walletAddress, selectedEventId);
        } catch {
          // Fall back to direct chain reads while the BFF catches up or restarts.
        }
      }

      return getCollectiblesByOwnerFromChain({
        rpcUrl: contractConfig.rpcUrl,
        chainId: contractConfig.chainId,
        collectibleContractAddress: selectedEvent!.collectibleContract!,
        owner: walletAddress,
        fromBlock: selectedEvent?.deploymentBlock ?? contractConfig.deploymentBlock,
      });
    },
  });
  const fanPerksQuery = useQuery({
    queryKey: [
      "fan-perks",
      selectedEventId,
      walletAddress,
      selectedEvent?.perkManager ?? "no-perk-manager",
      preferBffV2Reads ? runtimeConfig?.apiBaseUrl ?? "bff" : "chain",
    ],
    enabled: Boolean(
      walletAddress &&
      (selectedEvent?.version ?? "v1") === "v2" &&
      selectedEvent?.perkManager,
    ),
    retry: 1,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (preferBffV2Reads && bffClient && walletAddress) {
        try {
          return await bffClient.getFanPerks(walletAddress, selectedEventId);
        } catch {
          // Fall back to direct chain reads while the BFF catches up or restarts.
        }
      }

      return getPerksForFanFromChain({
        rpcUrl: contractConfig.rpcUrl,
        chainId: contractConfig.chainId,
        perkManagerAddress: selectedEvent!.perkManager!,
        fan: walletAddress!,
        fromBlock: selectedEvent?.deploymentBlock ?? contractConfig.deploymentBlock,
      });
    },
  });
  const merchCatalogQuery = useQuery({
    queryKey: [
      "merch-catalog",
      selectedEventId,
      selectedEvent?.merchStore ?? "no-merch-store",
      preferBffV2Reads ? runtimeConfig?.apiBaseUrl ?? "bff" : "chain",
    ],
    enabled: Boolean((selectedEvent?.version ?? "v1") === "v2" && selectedEvent?.merchStore),
    retry: 1,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (preferBffV2Reads && bffClient) {
        try {
          return await bffClient.getMerchCatalog(selectedEventId);
        } catch {
          // Fall back to direct chain reads while the BFF catches up or restarts.
        }
      }

      return getMerchCatalogFromChain({
        rpcUrl: contractConfig.rpcUrl,
        chainId: contractConfig.chainId,
        merchStoreAddress: selectedEvent!.merchStore!,
        fromBlock: selectedEvent?.deploymentBlock ?? contractConfig.deploymentBlock,
      });
    },
  });
  const merchRedemptionsQuery = useQuery({
    queryKey: [
      "merch-redemptions",
      selectedEventId,
      walletAddress,
      selectedEvent?.merchStore ?? "no-merch-store",
      preferBffV2Reads ? runtimeConfig?.apiBaseUrl ?? "bff" : "chain",
    ],
    enabled: Boolean(
      walletAddress && (selectedEvent?.version ?? "v1") === "v2" && selectedEvent?.merchStore,
    ),
    retry: 1,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (preferBffV2Reads && bffClient && walletAddress) {
        try {
          return await bffClient.getFanMerchRedemptions(walletAddress, selectedEventId);
        } catch {
          // Fall back to direct chain reads while the BFF catches up or restarts.
        }
      }

      return getMerchRedemptionsByFanFromChain({
        rpcUrl: contractConfig.rpcUrl,
        chainId: contractConfig.chainId,
        merchStoreAddress: selectedEvent!.merchStore!,
        fan: walletAddress,
        fromBlock: selectedEvent?.deploymentBlock ?? contractConfig.deploymentBlock,
      });
    },
  });

  const copy =
    locale === "fr"
      ? {
          title: "Ticket Vault",
          subtitle:
            "Le vault remplace la simple liste: chaque pass ressemble a un credential premium avec statut clair, QR visible, perks et potentiel collectible.",
          inventoryTitle: "Vos passes",
          inventorySubtitle: "Des cartes-pass plus belles et plus utiles, avec une action principale selon l'etat.",
          emptyTitle: "Aucun pass dans ce wallet",
          emptyDescription: "Connectez un wallet ou achetez votre premier billet pour remplir le vault.",
          openPass: "Ouvrir le pass",
          manageResale: "Gerer la revente",
          viewCollectible: "Voir le collectible",
          watch: "Suivre",
          unwatch: "Ne plus suivre",
          refresh: "Rafraichir le vault",
          walletConnected: "Wallet connecte",
          walletRequired: "Wallet requis",
          owned: "Detenus",
          listed: "En revente",
          used: "Utilises",
          collectibleLive: "Collectible actif",
          collectibleReady: "Collectible pret",
          indexedTitle: "Enrichissements indexes en attente",
          indexedImpact: "Les passes restent visibles en lecture directe on-chain pendant que la timeline enrichie et les analytics se remettent a jour.",
          mintFirst: "Acheter un premier billet",
          vaultEyebrow: "Ticket Vault",
          vaultSummary:
            "Le vault met le billet au centre du produit: statut, preuve, perks, collectible et action principale s'alignent dans la meme carte.",
          passesLabel: "Pass",
          statusLabel: "Statut",
          primaryActionLabel: "Action principale",
          qrReady: "QR pret",
          collectiblePreview: "Apercu collectible",
          tokenLabel: "Token",
          notListed: "Non liste",
          digitalPass: "Pass digital",
          admissionPass: "Pass admission",
          tableToken: "Token",
          tablePass: "Pass",
          tableListing: "Annonce",
          tableAction: "Action principale",
          tableWatch: "Suivi",
            vaultView: "Vault",
            fanProfileTitle: "Fan profile",
            fanProfileSubtitle:
              "La stack fan transforme l'historique d'achat en reputation, FanFuel et collectibles visibles dans le vault.",
          collectiblesTitle: "Collectibles",
          collectiblesSubtitle:
            "Les souvenirs post-check-in restent visibles a cote des billets encore actifs, pour que le vault garde une narration complete.",
          emptyCollectibles: "Aucun collectible pour ce wallet",
          viewSouvenir: "Ouvrir le souvenir",
          sourceTicket: "Ticket source",
          sourceClass: "Classe source",
          collectibleLevel: "Niveau",
          collectibleOwner: "Detenteur",
          fanTier: "Tier",
          fanScore: "Score",
          fanFuel: "FanFuel",
          attendance: "Presences",
          collectibles: "Collectibles",
          perksTitle: "Perks on-chain",
          perksSubtitle:
            "Vos droits exclusifs deviennent actionnables par smart contract selon reputation, presence et FanFuel.",
          perkRequirementScore: "Score min",
          perkRequirementAttendance: "Presences min",
          perkRequirementFuel: "Cout FanFuel",
          perkUnlocked: "Deverrouille",
          perkLocked: "Verrouille",
          perkInactive: "Inactif",
          perkRedeemed: "Redeems",
          perksEmpty: "Aucun perk configure pour cet evenement",
          redeemPerk: "Redeem perk",
          redeemPerkPreviewLabel: "Redemption perk",
          redeemPerkPreviewDescription:
            "Consommer un perk on-chain en appliquant les regles de reputation, de presence et de FanFuel.",
          merchTitle: "Boutique phygitale",
          merchSubtitle:
            "Depensez votre FanFuel pour des drops exclusifs et recevez un twin NFT comme preuve d'authenticite.",
          merchBalanceHint: "Balance FanFuel disponible",
          merchCost: "Cout",
          merchStock: "Stock",
          merchTwin: "Twin",
          merchHistory: "Historique merch",
          merchEmpty: "Aucun drop merch configure pour cet evenement",
          merchHistoryEmpty: "Aucune redemption merch pour ce wallet",
          redeemMerch: "Redeem avec FanFuel",
          redeemMerchPreviewLabel: "Redemption merch",
          redeemMerchPreviewDescription:
            "Depenser du FanFuel pour reserver un item merch et mint son NFT jumeau d'authenticite.",
          soldOut: "Rupture",
          inactive: "Inactif",
        }
      : {
          title: "Ticket Vault",
          subtitle:
            "The vault replaces the simple list: every pass reads like a premium credential with clear status, QR readiness, perks, and collectible upside.",
          inventoryTitle: "Your passes",
          inventorySubtitle: "More premium pass cards with one primary action per state.",
          emptyTitle: "No passes in this wallet",
          emptyDescription: "Connect a wallet or mint your first ticket to populate the vault.",
          openPass: "Open pass",
          manageResale: "Manage resale",
          viewCollectible: "View collectible",
          watch: "Watch",
          unwatch: "Unwatch",
          refresh: "Refresh vault",
          walletConnected: "Wallet connected",
          walletRequired: "Wallet required",
          owned: "Owned",
          listed: "Listed",
          used: "Used",
          collectibleLive: "Collectible live",
          collectibleReady: "Collectible ready",
          indexedTitle: "Indexed enrichments delayed",
          indexedImpact: "Passes still load from direct chain reads while richer lifecycle and analytics views catch up.",
          mintFirst: "Mint first ticket",
          vaultEyebrow: "Ticket Vault",
          vaultSummary:
            "The vault treats the pass as the emotional core of the product: status, proof, perks, collectible mode, and the primary action all align in the same card.",
          passesLabel: "Pass",
          statusLabel: "Status",
          primaryActionLabel: "Primary action",
          qrReady: "QR ready",
          collectiblePreview: "Collectible preview",
          tokenLabel: "Token",
          notListed: "Not listed",
          digitalPass: "Digital pass",
          admissionPass: "Admission pass",
          tableToken: "Token",
          tablePass: "Pass",
          tableListing: "Listing",
          tableAction: "Primary action",
          tableWatch: "Watch",
            vaultView: "Vault",
            fanProfileTitle: "Fan profile",
            fanProfileSubtitle:
              "The fan stack turns purchase history into visible reputation, FanFuel, and collectible progress inside the vault.",
          collectiblesTitle: "Collectibles",
          collectiblesSubtitle:
            "Post-check-in souvenirs stay visible next to live passes so the vault keeps the full fan story.",
          emptyCollectibles: "No collectibles for this wallet",
          viewSouvenir: "Open souvenir",
          sourceTicket: "Source ticket",
          sourceClass: "Source class",
          collectibleLevel: "Level",
          collectibleOwner: "Owner",
          fanTier: "Tier",
          fanScore: "Score",
          fanFuel: "FanFuel",
          attendance: "Attendance",
          collectibles: "Collectibles",
          perksTitle: "On-chain perks",
          perksSubtitle:
            "Exclusive rights become smart-contract unlocks based on reputation, attendance, and FanFuel.",
          perkRequirementScore: "Min score",
          perkRequirementAttendance: "Min attendance",
          perkRequirementFuel: "FanFuel cost",
          perkUnlocked: "Unlocked",
          perkLocked: "Locked",
          perkInactive: "Inactive",
          perkRedeemed: "Redemptions",
          perksEmpty: "No perks configured for this event",
          redeemPerk: "Redeem perk",
          redeemPerkPreviewLabel: "Perk redemption",
          redeemPerkPreviewDescription:
            "Redeem an on-chain perk using its configured reputation, attendance, and FanFuel rules.",
          merchTitle: "Phygital merch",
          merchSubtitle:
            "Spend FanFuel on exclusive drops and receive a twin NFT that proves authenticity.",
          merchBalanceHint: "Available FanFuel balance",
          merchCost: "Cost",
          merchStock: "Stock",
          merchTwin: "Twin",
          merchHistory: "Merch history",
          merchEmpty: "No merch drops configured for this event",
          merchHistoryEmpty: "No merch redemptions for this wallet",
          redeemMerch: "Redeem with FanFuel",
          redeemMerchPreviewLabel: "Merch redemption",
          redeemMerchPreviewDescription:
            "Spend FanFuel to reserve a merch item and mint its authenticity twin NFT.",
          soldOut: "Sold out",
          inactive: "Inactive",
        };

  const sortedTickets = useMemo(
    () => [...tickets].sort((left, right) => (left.tokenId > right.tokenId ? -1 : 1)),
    [tickets],
  );

  const ticketCounters = useMemo(() => {
    let owned = 0;
    let used = 0;
    let listed = 0;
    let collectible = 0;

    for (const ticket of sortedTickets) {
      if (ticket.used) {
        used += 1;
      } else {
        owned += 1;
      }
      if (ticket.listed) {
        listed += 1;
      }
      if (ticket.used && systemState?.collectibleMode) {
        collectible += 1;
      }
    }

    return { owned, used, listed, collectible };
  }, [sortedTickets, systemState?.collectibleMode]);

  const previewDescriptors = useMemo(
    () =>
      sortedTickets.map((ticket) => ({
        key: ticket.tokenId.toString(),
        tokenId: ticket.tokenId,
        ...resolvePreviewDescriptor({
          tokenId: ticket.tokenId,
          eventId: contractConfig.eventId,
          tokenUri: ticket.tokenURI,
          collectibleMode: Boolean(systemState?.collectibleMode),
          baseTokenURI: systemState?.baseTokenURI,
          collectibleBaseURI: systemState?.collectibleBaseURI,
        }),
      })),
    [
      contractConfig.eventId,
      sortedTickets,
      systemState?.baseTokenURI,
      systemState?.collectibleBaseURI,
      systemState?.collectibleMode,
    ],
  );
  const previews = useTicketPreviewCollection(previewDescriptors);
  const collectiblePreviewDescriptors = useMemo(
    () =>
      (collectiblesQuery.data ?? []).map((collectible) => ({
        key: `collectible-${collectible.collectibleId.toString()}`,
        tokenId: collectible.collectibleId,
        ticketEventId: contractConfig.eventId,
        activeTokenUri: collectible.tokenURI,
        activeView: "collectible" as const,
        liveTokenUri: null,
        collectibleTokenUri: collectible.tokenURI,
      })),
    [collectiblesQuery.data, contractConfig.eventId],
  );
  const collectiblePreviews = useTicketPreviewCollection(collectiblePreviewDescriptors);
  const hasCollectibles = (collectiblesQuery.data?.length ?? 0) > 0;
  const hasPerks = (fanPerksQuery.data?.length ?? 0) > 0;
  const hasMerchCatalog = (merchCatalogQuery.data?.length ?? 0) > 0;
  const hasMerchHistory = (merchRedemptionsQuery.data?.length ?? 0) > 0;
  const hasInventory = sortedTickets.length > 0 || hasCollectibles || hasPerks;
  const knownFuelBalance = fanProfileQuery.data?.fuelBalance ?? null;
  const ticketPerkLabels = getTicketPerks(locale);
  const ticketPerkHighlights = ticketPerkLabels.slice(0, 2);
  const hiddenTicketPerkCount = Math.max(ticketPerkLabels.length - ticketPerkHighlights.length, 0);
  const vaultStatEntries = [
    { label: copy.owned, value: ticketCounters.owned.toString(), surface: "accent" as const },
    { label: copy.listed, value: ticketCounters.listed.toString(), surface: "glass" as const },
    {
      label: "Collectible",
      value: (hasCollectibles ? collectiblesQuery.data!.length : ticketCounters.collectible).toString(),
      surface: "glass" as const,
    },
    ...(fanProfileQuery.data
      ? [
          {
            label: copy.fanTier,
            value: fanProfileQuery.data.tierLabel.toUpperCase(),
            surface: "glass" as const,
          },
          {
            label: copy.fanScore,
            value: fanProfileQuery.data.reputationScore.toString(),
            surface: "glass" as const,
          },
          {
            label: copy.fanFuel,
            value: fanProfileQuery.data.fuelBalance.toString(),
            surface: "glass" as const,
          },
        ]
      : []),
  ];

  useEffect(() => {
    if (
      txState.status === "success" &&
      (
        txState.label?.startsWith(copy.redeemMerchPreviewLabel) ||
        txState.label?.startsWith(copy.redeemPerkPreviewLabel)
      )
    ) {
      void fanProfileQuery.refetch();
      void fanPerksQuery.refetch();
      void merchCatalogQuery.refetch();
      void merchRedemptionsQuery.refetch();
    }
  }, [
    copy.redeemPerkPreviewLabel,
    copy.redeemMerchPreviewLabel,
    fanProfileQuery,
    fanPerksQuery,
    merchCatalogQuery,
    merchRedemptionsQuery,
    txState.label,
    txState.status,
  ]);

  const onRedeemPerk = async (perkId: string, title: string) => {
    try {
      await preparePreview({
        label: `${copy.redeemPerkPreviewLabel}: ${title}`,
        description: copy.redeemPerkPreviewDescription,
        action: { type: "redeem_perk", perkId },
        details: [
          locale === "fr"
            ? "Verifie le statut du perk, votre eligibilite et la balance FanFuel avant signature."
            : "Checks perk status, fan eligibility, and FanFuel balance before signature.",
          locale === "fr"
            ? "Le smart contract confirme reputation et presence avant de debiter le FanFuel requis."
            : "The smart contract confirms reputation and attendance before spending the required FanFuel.",
          locale === "fr" ? `Perk cible: ${title}.` : `Target perk: ${title}.`,
        ],
        run: async (client) => {
          if (!client.redeemPerk) {
            throw new Error(
              locale === "fr"
                ? "La redemption de perk est indisponible dans ce client."
                : "Perk redemption is unavailable in this client.",
            );
          }
          return client.redeemPerk(perkId);
        },
      });
    } catch (error) {
      setErrorMessage(mapEthersError(error));
    }
  };

  const onRedeemMerch = async (skuId: string) => {
    try {
      await preparePreview({
        label: `${copy.redeemMerchPreviewLabel}: ${skuId}`,
        description: copy.redeemMerchPreviewDescription,
        action: { type: "redeem_merch", skuId },
        details: [
          locale === "fr"
            ? "Verifie le stock du SKU et la balance FanFuel avant signature."
            : "Checks SKU stock and FanFuel balance before signature.",
          locale === "fr"
            ? "Le merch store depense le FanFuel puis mint un twin NFT de redemption."
            : "The merch store spends FanFuel and then mints a redemption twin NFT.",
          locale === "fr" ? `SKU cible: ${skuId}.` : `Target SKU: ${skuId}.`,
        ],
        run: async (client) => {
          if (!client.redeemMerch) {
            throw new Error(
              locale === "fr"
                ? "La redemption merch est indisponible dans ce client."
                : "Merch redemption is unavailable in this client.",
            );
          }
          return client.redeemMerch(skuId);
        },
      });
    } catch (error) {
      setErrorMessage(mapEthersError(error));
    }
  };

  return (
    <div className="route-stack tickets-route" data-testid="tickets-page">
      <PageHeader
        title={copy.title}
        subtitle={
          locale === "fr"
            ? "Un vault plus calme: les passes au centre, puis les perks, collectibles et drops quand vous voulez les ouvrir."
            : "A calmer vault: passes first, then perks, collectibles, and drops when you choose to open them."
        }
        workspace="tickets"
        context={
          <div className="inline-actions">
            <Badge tone={walletAddress ? "success" : "warning"} emphasis="solid">
              {walletAddress ? copy.walletConnected : copy.walletRequired}
            </Badge>
            <Tag tone="success">{`${copy.owned} ${ticketCounters.owned}`}</Tag>
            <Tag tone="info">{`${copy.collectibles} ${hasCollectibles ? collectiblesQuery.data!.length : ticketCounters.collectible}`}</Tag>
          </div>
        }
        primaryAction={
          <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
            {copy.refresh}
          </button>
        }
        secondaryActions={
          <SegmentedToggle<TicketViewMode>
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "card", label: copy.vaultView },
              { value: "table", label: "Table" },
            ]}
            ariaLabel="Ticket inventory view mode"
          />
        }
      />

      <EventDemoNotice event={selectedEvent} />

      {!walletAddress ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyDescription}
          action={
            <button type="button" className="primary" onClick={() => void connectWallet()}>
              {t("connectWallet")}
            </button>
          }
        />
      ) : null}

      {walletAddress && !indexedReadsAvailable ? (
        <IndexedReadinessBanner
          title={copy.indexedTitle}
          impact={copy.indexedImpact}
        />
      ) : null}

      {walletAddress && indexedReadsAvailable && !hasInventory ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyDescription}
          action={
            <Link to="/app/explore" className="button-link primary">
              {copy.mintFirst}
            </Link>
          }
        />
      ) : null}

      {walletAddress && hasInventory ? (
        <Panel className="vault-summary-panel" surface="glass">
          <div className="vault-summary-copy">
            <p className="eyebrow">{copy.vaultEyebrow}</p>
            <h2>{selectedEventName || contractConfig.eventName || "ChainTicket passes"}</h2>
            <p>{copy.vaultSummary}</p>
            {fanProfileQuery.data ? (
              <div className="inline-actions">
                <Tag tone="info">{selectedEvent?.artistId ?? selectedEventName ?? "Artist"}</Tag>
                <Tag tone={systemState?.collectibleMode ? "info" : "default"}>
                  {systemState?.collectibleMode ? copy.collectibleLive : copy.collectibleReady}
                </Tag>
              </div>
            ) : null}
          </div>
          <div className="vault-stat-grid">
            {vaultStatEntries.map((entry, index) => (
              <Card
                key={`${entry.label}-${index}`}
                className="vault-stat-card"
                surface={entry.surface}
              >
                <span>{entry.label}</span>
                <strong>{entry.value}</strong>
              </Card>
            ))}
          </div>
          {fanProfileQuery.data ? (
            <InfoList
              entries={[
                { label: copy.attendance, value: fanProfileQuery.data.artistAttendanceCount.toString() },
                { label: copy.collectibles, value: fanProfileQuery.data.collectibleCount.toString() },
                { label: copy.passesLabel, value: fanProfileQuery.data.currentTicketCount },
                { label: copy.listed, value: fanProfileQuery.data.listedTicketCount },
              ]}
            />
          ) : null}
        </Panel>
      ) : null}

      {walletAddress &&
      (selectedEvent?.version ?? "v1") === "v2" &&
      selectedEvent?.perkManager ? (
        <DetailAccordion
          title={copy.perksTitle}
          subtitle={copy.perksSubtitle}
          className="vault-detail-accordion"
        >
          {hasPerks ? (
            <section className="ticket-pass-grid">
              {fanPerksQuery.data!.map((perk) => {
                const title = perkDisplayName(perk.perkId, perk.metadataURI);
                const disabled =
                  !perk.active ||
                  !perk.unlocked ||
                  (knownFuelBalance !== null && knownFuelBalance < perk.fuelCost);

                return (
                  <Card
                    key={perk.perkId}
                    className="ticket-pass-card vault-pass-card"
                    surface="glass"
                  >
                    <div className="ticket-pass-copy">
                      <div className="ticket-pass-heading">
                        <div>
                          <p className="ticket-pass-kicker">{copy.perksTitle}</p>
                          <h3>{title}</h3>
                        </div>
                        <Badge
                          tone={
                            !perk.active ? "warning" : perk.unlocked ? "success" : "default"
                          }
                          emphasis="solid"
                        >
                          {!perk.active
                            ? copy.perkInactive
                            : perk.unlocked
                              ? copy.perkUnlocked
                              : copy.perkLocked}
                        </Badge>
                      </div>

                      <p className="ticket-pass-description">
                        {perk.metadataURI
                          ? perk.metadataURI
                          : locale === "fr"
                            ? "Perk configure on-chain pour cet artiste."
                            : "On-chain perk configured for this artist."}
                      </p>

                      <InfoList
                        entries={[
                          {
                            label: copy.perkRequirementScore,
                            value: perk.minScore.toString(),
                          },
                          {
                            label: copy.perkRequirementAttendance,
                            value: perk.minAttendances.toString(),
                          },
                          {
                            label: copy.perkRequirementFuel,
                            value: `${perk.fuelCost.toString()} ${copy.fanFuel}`,
                          },
                          {
                            label: copy.perkRedeemed,
                            value: perk.redeemedCount.toString(),
                          },
                        ]}
                      />

                      <div className="ticket-pass-footer">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => void onRedeemPerk(perk.perkId, title)}
                          disabled={disabled}
                        >
                          {copy.redeemPerk}
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </section>
          ) : !fanPerksQuery.isLoading ? (
            <Panel className="vault-summary-panel" surface="glass">
              <p>{copy.perksEmpty}</p>
            </Panel>
          ) : null}
        </DetailAccordion>
      ) : null}

      {walletAddress &&
      (selectedEvent?.version ?? "v1") === "v2" &&
      selectedEvent?.merchStore ? (
        <DetailAccordion
          title={copy.merchTitle}
          subtitle={`${copy.merchSubtitle} ${copy.merchBalanceHint}: ${
            knownFuelBalance !== null ? knownFuelBalance.toString() : "-"
          }`}
          className="vault-detail-accordion"
        >
          {hasMerchCatalog ? (
            <section className="ticket-pass-grid">
              {merchCatalogQuery.data!.map((sku) => {
                const disabled =
                  !sku.active ||
                  sku.stock <= 0n ||
                  (knownFuelBalance !== null && knownFuelBalance < sku.price);

                return (
                  <Card
                    key={sku.skuId}
                    className="ticket-pass-card vault-pass-card"
                    surface="glass"
                  >
                    <div className="ticket-pass-copy">
                      <div className="ticket-pass-heading">
                        <div>
                          <p className="ticket-pass-kicker">{copy.merchTitle}</p>
                          <h3>{sku.skuId}</h3>
                        </div>
                        <Badge
                          tone={
                            !sku.active ? "warning" : sku.stock > 0n ? "success" : "danger"
                          }
                          emphasis="solid"
                        >
                          {!sku.active
                            ? copy.inactive
                            : sku.stock > 0n
                              ? `${copy.merchStock} ${sku.stock.toString()}`
                              : copy.soldOut}
                        </Badge>
                      </div>

                      <p className="ticket-pass-description">
                        {locale === "fr"
                          ? "Drop exclusif reserve aux fans engages. La redemption mint un NFT jumeau comme preuve d'authenticite."
                          : "Exclusive drop reserved for engaged fans. Redemption mints a twin NFT as authenticity proof."}
                      </p>

                      <InfoList
                        entries={[
                          {
                            label: copy.merchCost,
                            value: `${sku.price.toString()} ${copy.fanFuel}`,
                          },
                          {
                            label: copy.merchStock,
                            value: sku.stock.toString(),
                          },
                          {
                            label: copy.merchBalanceHint,
                            value: knownFuelBalance !== null ? knownFuelBalance.toString() : "-",
                          },
                        ]}
                      />

                      <div className="ticket-pass-footer">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => void onRedeemMerch(sku.skuId)}
                          disabled={disabled}
                        >
                          {copy.redeemMerch}
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </section>
          ) : !merchCatalogQuery.isLoading ? (
            <Panel className="vault-summary-panel" surface="glass">
              <p>{copy.merchEmpty}</p>
            </Panel>
          ) : null}

          {hasMerchHistory ? (
            <Panel className="vault-summary-panel" surface="glass">
              <SectionHeader
                title={copy.merchHistory}
                actions={<Tag tone="info">{merchRedemptionsQuery.data!.length.toString()}</Tag>}
              />
              <div className="ticket-pass-grid">
                {merchRedemptionsQuery.data!.map((redemption) => (
                  <Card
                    key={`${redemption.txHash}-${redemption.twinId.toString()}`}
                    className="ticket-pass-card vault-pass-card"
                    surface="quiet"
                  >
                    <div className="ticket-pass-copy">
                      <div className="ticket-pass-heading">
                        <div>
                          <p className="ticket-pass-kicker">{copy.merchHistory}</p>
                          <h3>{redemption.skuId}</h3>
                        </div>
                        <Badge tone="info" emphasis="solid">
                          {copy.merchTwin} #{redemption.twinId.toString()}
                        </Badge>
                      </div>
                      <InfoList
                        entries={[
                          {
                            label: copy.merchCost,
                            value: `${redemption.fuelCost.toString()} ${copy.fanFuel}`,
                          },
                          {
                            label: copy.collectibleOwner,
                            value: formatAddress(redemption.fan),
                          },
                          {
                            label: "Tx",
                            value: formatAddress(redemption.txHash, 8),
                          },
                        ]}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </Panel>
          ) : !merchRedemptionsQuery.isLoading ? (
            <Panel className="vault-summary-panel" surface="glass">
              <SectionHeader title={copy.merchHistory} />
              <p>{copy.merchHistoryEmpty}</p>
            </Panel>
          ) : null}
        </DetailAccordion>
      ) : null}

      {walletAddress && sortedTickets.length > 0 ? (
        <SectionHeader
          title={copy.inventoryTitle}
          subtitle={copy.inventorySubtitle}
          actions={<Tag tone="info">{sortedTickets.length.toString()}</Tag>}
        />
      ) : null}

      {walletAddress && sortedTickets.length > 0 && viewMode === "card" ? (
        <section className="ticket-pass-grid">
          {sortedTickets.map((ticket) => {
            const preview = previews.get(ticket.tokenId.toString());
            const activeMetadata = preview?.activeMetadata;
            const activeMedia = preview?.activeMedia;
            const collectibleReady = Boolean(preview?.collectibleTokenUri) && !systemState?.collectibleMode;
            const stateLabel = getTicketStateLabel({
              locale,
              ticket,
              collectibleMode: Boolean(systemState?.collectibleMode),
              collectibleReady,
            });
            const primaryAction =
              ticket.used && (collectibleReady || Boolean(systemState?.collectibleMode))
                ? {
                    to: `/app/tickets/${ticket.tokenId.toString()}?view=collectible`,
                    label: copy.viewCollectible,
                  }
                : ticket.listed
                  ? { to: "/app/marketplace", label: copy.manageResale }
                  : { to: `/app/tickets/${ticket.tokenId.toString()}`, label: copy.openPass };
            const timelineSteps = [
              { label: copy.owned, status: "done" as const },
              {
                label: copy.listed,
                status: ticket.listed ? ("done" as const) : ("upcoming" as const),
              },
              {
                label: copy.used,
                status: ticket.used ? ("done" as const) : ("active" as const),
              },
              {
                label: "Collectible",
                status:
                  ticket.used && (collectibleReady || Boolean(systemState?.collectibleMode))
                    ? ("done" as const)
                    : ("upcoming" as const),
              },
            ];

            return (
              <Card key={ticket.tokenId.toString()} className="ticket-pass-card vault-pass-card" surface="accent">
                <div className="ticket-pass-visual">
                  <TicketMedia
                    media={
                      activeMedia ?? {
                        kind: "fallback",
                        src: null,
                        posterSrc: null,
                        alt: `Ticket #${ticket.tokenId.toString()}`,
                      }
                    }
                    fallbackTitle={selectedEventName || `Ticket #${ticket.tokenId.toString()}`}
                    fallbackSubtitle={`Token #${ticket.tokenId.toString()}`}
                  />
                  <div className="ticket-pass-overlay">
                    <Tag tone="default">{selectedEventName || contractConfig.eventName || "ChainTicket"}</Tag>
                    <Tag tone={ticket.used ? "warning" : ticket.listed ? "info" : "success"}>{stateLabel}</Tag>
                  </div>
                </div>

                  <div className="ticket-pass-copy">
                  <div className="ticket-pass-heading">
                    <div>
                      <p className="ticket-pass-kicker">{copy.digitalPass}</p>
                      <h3>{activeMetadata?.name ?? `${copy.admissionPass} #${ticket.tokenId.toString()}`}</h3>
                    </div>
                    <Badge tone={ticket.used ? "warning" : ticket.listed ? "info" : "success"} emphasis="solid">
                      {stateLabel}
                    </Badge>
                  </div>

                  <p className="ticket-pass-description">
                    {activeMetadata?.description ??
                      "Ownership, check-in status, resale state, and collectible upside all stay readable from the vault."}
                  </p>

                  <div className="ticket-pass-meta">
                    <span>{`${copy.tokenLabel} #${ticket.tokenId.toString()}`}</span>
                    <span>{formatAddress(ticket.owner)}</span>
                    <span>{ticket.listed ? `${formatPol(ticket.listingPrice ?? 0n)} POL` : copy.notListed}</span>
                  </div>

                  <ProgressStepper steps={timelineSteps} className="vault-lifecycle-stepper" />

                  <div className="ticket-pass-attribute-row">
                    <Tag tone="info">{copy.qrReady}</Tag>
                    {collectibleReady ? <Tag tone="success">{copy.collectiblePreview}</Tag> : null}
                    {ticketPerkHighlights.map((perk) => (
                      <Tag key={`${ticket.tokenId.toString()}-${perk}`} tone="default">
                        {perk}
                      </Tag>
                    ))}
                    {hiddenTicketPerkCount > 0 ? <Tag tone="default">+{hiddenTicketPerkCount}</Tag> : null}
                  </div>

                  {(activeMetadata?.attributes.length ?? 0) > 0 ? (
                    <div className="ticket-pass-attribute-grid">
                      {activeMetadata!.attributes.slice(0, 3).map((attribute) => (
                        <div
                          key={`${ticket.tokenId.toString()}-${attribute.traitType}`}
                          className="ticket-attribute-chip"
                        >
                          <span>{attribute.traitType}</span>
                          <strong>{attribute.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="ticket-pass-footer">
                    <Link to={primaryAction.to} className="button-link primary">
                      {primaryAction.label}
                    </Link>
                    <button type="button" className="ghost" onClick={() => toggleWatch(ticket.tokenId)}>
                      {watchlist.has(eventWatchKey(ticket.tokenId)) ? copy.unwatch : copy.watch}
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </section>
      ) : walletAddress && sortedTickets.length > 0 ? (
        <Panel className="tickets-table-panel" surface="glass">
          <table className="market-table">
            <thead>
              <tr>
                <th>{copy.tableToken}</th>
                <th>{copy.tablePass}</th>
                <th>{copy.statusLabel}</th>
                <th>{copy.tableListing}</th>
                <th>{copy.tableAction}</th>
                <th>{copy.tableWatch}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((ticket) => {
                const preview = previews.get(ticket.tokenId.toString());
                const collectibleReady = Boolean(preview?.collectibleTokenUri) && !systemState?.collectibleMode;
                const stateLabel = getTicketStateLabel({
                  locale,
                  ticket,
                  collectibleMode: Boolean(systemState?.collectibleMode),
                  collectibleReady,
                });
                const action =
                  ticket.used && (collectibleReady || Boolean(systemState?.collectibleMode))
                    ? { to: `/app/tickets/${ticket.tokenId.toString()}?view=collectible`, label: copy.viewCollectible }
                    : ticket.listed
                      ? { to: "/app/marketplace", label: copy.manageResale }
                      : { to: `/app/tickets/${ticket.tokenId.toString()}`, label: copy.openPass };

                return (
                  <tr key={ticket.tokenId.toString()}>
                    <td>#{ticket.tokenId.toString()}</td>
                    <td>{preview?.activeMetadata?.name ?? copy.admissionPass}</td>
                    <td>{stateLabel}</td>
                    <td>{ticket.listed ? `${formatPol(ticket.listingPrice ?? 0n)} POL` : "-"}</td>
                    <td>
                      <Link to={action.to} className="button-link ghost">
                        {action.label}
                      </Link>
                    </td>
                    <td>
                      <button type="button" className="ghost" onClick={() => toggleWatch(ticket.tokenId)}>
                        {watchlist.has(eventWatchKey(ticket.tokenId)) ? copy.unwatch : copy.watch}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ) : null}

      {walletAddress && hasCollectibles ? (
        <DetailAccordion
          title={copy.collectiblesTitle}
          subtitle={`${copy.collectiblesSubtitle} ${collectiblesQuery.data!.length.toString()}`}
          className="vault-detail-accordion"
        >
          <section className="ticket-pass-grid">
            {collectiblesQuery.data!.map((collectible) => {
              const preview = collectiblePreviews.get(`collectible-${collectible.collectibleId.toString()}`);
              const metadata = preview?.collectibleMetadata ?? preview?.activeMetadata;
              const media = preview?.collectibleMedia ?? preview?.activeMedia;

              return (
                <Card
                  key={collectible.collectibleId.toString()}
                  className="ticket-pass-card vault-pass-card"
                  surface="glass"
                >
                  <div className="ticket-pass-visual">
                    <TicketMedia
                      media={
                        media ?? {
                          kind: "fallback",
                          src: null,
                          posterSrc: null,
                          alt: `Collectible #${collectible.collectibleId.toString()}`,
                        }
                      }
                      fallbackTitle={
                        metadata?.name ??
                        `${copy.collectiblesTitle} #${collectible.collectibleId.toString()}`
                      }
                      fallbackSubtitle={`Ticket #${collectible.sourceTicketId.toString()}`}
                    />
                    <div className="ticket-pass-overlay">
                      <Tag tone="info">{copy.collectiblesTitle}</Tag>
                      <Tag tone="success">
                        {copy.collectibleLevel} {collectible.level.toString()}
                      </Tag>
                    </div>
                  </div>

                  <div className="ticket-pass-copy">
                    <div className="ticket-pass-heading">
                      <div>
                        <p className="ticket-pass-kicker">{copy.collectiblesTitle}</p>
                        <h3>
                          {metadata?.name ??
                            `${copy.collectiblesTitle} #${collectible.collectibleId.toString()}`}
                        </h3>
                      </div>
                      <Badge tone="info" emphasis="solid">
                        L{collectible.level.toString()}
                      </Badge>
                    </div>

                    <p className="ticket-pass-description">
                      {metadata?.description ??
                        (locale === "fr"
                          ? "Souvenir mint apres check-in, avec niveau evolutif selon l'historique fan."
                          : "Souvenir minted after check-in with a level that evolves with fan history.")}
                    </p>

                    <InfoList
                      entries={[
                        {
                          label: copy.sourceTicket,
                          value: `#${collectible.sourceTicketId.toString()}`,
                        },
                        {
                          label: copy.sourceClass,
                          value: collectible.sourceTicketClass === 1 ? "FanPass" : "Standard",
                        },
                        {
                          label: copy.collectibleOwner,
                          value: formatAddress(collectible.owner),
                        },
                      ]}
                    />

                    <div className="ticket-pass-footer">
                      <Link
                        to={`/app/tickets/${collectible.sourceTicketId.toString()}?view=collectible&collectibleId=${collectible.collectibleId.toString()}`}
                        className="button-link primary"
                      >
                        {copy.viewSouvenir}
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </section>
        </DetailAccordion>
      ) : walletAddress &&
        (selectedEvent?.version ?? "v1") === "v2" &&
        !collectiblesQuery.isLoading &&
        sortedTickets.length === 0 ? (
        <Panel className="vault-summary-panel" surface="glass">
          <SectionHeader title={copy.collectiblesTitle} subtitle={copy.collectiblesSubtitle} />
          <p>{copy.emptyCollectibles}</p>
        </Panel>
      ) : null}
    </div>
  );
}
