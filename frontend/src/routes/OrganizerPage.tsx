import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "ethers";
import { Link } from "react-router-dom";

import {
  ButtonGroup,
  Card,
  DetailAccordion,
  InfoList,
  PageHeader,
  Panel,
  RiskBanner,
  SectionHeader,
  Tag,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { createBffClient } from "../lib/bffClient";
import {
  DEFAULT_ADMIN_ROLE,
  PAUSER_ROLE,
  SCANNER_ADMIN_ROLE,
  SCANNER_ROLE,
} from "../lib/chainTicketClient/parsers";
import { formatAddress, formatPol } from "../lib/format";
import { buildCollectibleModeGovernancePacket, type GovernancePacket } from "../lib/governance";
import { useAppState } from "../state/useAppState";
import type { OperationalActivity, OperationalRoleAssignment } from "../types/chainticket";

function labelRole(role: OperationalRoleAssignment): string {
  if (role.roleId === DEFAULT_ADMIN_ROLE && role.contractScope === "ticket") {
    return "Governance admins";
  }
  if (role.roleId === PAUSER_ROLE) {
    return "Pausers";
  }
  if (role.roleId === SCANNER_ADMIN_ROLE) {
    return "Scanner admins";
  }
  if (role.roleId === SCANNER_ROLE) {
    return "Scanners";
  }
  return `${role.contractScope} role`;
}

function describeActivity(activity: OperationalActivity): string {
  if (activity.type === "paused") {
    return `System paused by ${activity.actor ? formatAddress(activity.actor, 6) : "unknown"}`;
  }
  if (activity.type === "unpaused") {
    return `System unpaused by ${activity.actor ? formatAddress(activity.actor, 6) : "unknown"}`;
  }

  const account = activity.account ? formatAddress(activity.account, 6) : "unknown";
  const actor = activity.actor ? formatAddress(activity.actor, 6) : "unknown";
  const roleLabel =
    activity.roleId === DEFAULT_ADMIN_ROLE
      ? "governance admin"
      : activity.roleId === PAUSER_ROLE
        ? "pauser"
        : activity.roleId === SCANNER_ADMIN_ROLE
          ? "scanner admin"
          : activity.roleId === SCANNER_ROLE
            ? "scanner"
            : "custom role";

  return activity.type === "role_granted"
    ? `${roleLabel} granted to ${account} by ${actor}`
    : `${roleLabel} revoked from ${account} by ${actor}`;
}

function formatGovernanceDelay(seconds: number): string {
  if (seconds <= 0) {
    return "No enforced delay";
  }

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}

function formatBps(value?: string): string {
  if (!value) {
    return "-";
  }
  return `${(Number(value) / 100).toFixed(2)}%`;
}

export function OrganizerPage() {
  const { locale, t } = useI18n();
  const {
    contractConfig,
    runtimeConfig,
    indexedReadsAvailable,
    walletAddress,
    userRoles,
    systemState,
    marketStats,
    availableEvents,
    selectedEventId,
    preparePreview,
    setErrorMessage,
    setStatusMessage,
    refreshDashboard,
    uiMode,
  } = useAppState();
  const [scannerAddressInput, setScannerAddressInput] = useState("");
  const [governancePacket, setGovernancePacket] = useState<GovernancePacket | null>(null);
  const bffClient = useMemo(
    () => createBffClient(runtimeConfig?.apiBaseUrl ?? null),
    [runtimeConfig?.apiBaseUrl],
  );
  const selectedEvent =
    (availableEvents ?? []).find((event) => event.ticketEventId === selectedEventId) ?? null;
  const governancePacketJson = useMemo(
    () => (governancePacket ? JSON.stringify(governancePacket, null, 2) : ""),
    [governancePacket],
  );
  const isUpgradedEvent = selectedEvent?.version === "v2";

  useEffect(() => {
    setGovernancePacket(null);
  }, [
    contractConfig.eventId,
    contractConfig.ticketNftAddress,
    runtimeConfig?.governanceTimelockAddress,
  ]);

  const canPauseSystem = userRoles.isPauser;
  const canManageScanners = userRoles.isScannerAdmin;
  const canGovern = userRoles.isAdmin;
  const hasOrganizerAccess = canPauseSystem || canManageScanners || canGovern;

  const opsSummaryQuery = useQuery({
    queryKey: [
      "organizer-ops-summary",
      contractConfig.eventId,
      runtimeConfig?.apiBaseUrl,
      indexedReadsAvailable,
    ],
    enabled: Boolean(bffClient && indexedReadsAvailable && contractConfig.eventId),
    retry: 1,
    refetchInterval: 25_000,
    queryFn: async () => bffClient!.getOperationalSummary(contractConfig.eventId),
  });

  const groupedRoles = useMemo(() => {
    const roles = opsSummaryQuery.data?.roles ?? [];
    return {
      governanceAdmins: roles.filter(
        (role) => role.contractScope === "ticket" && role.roleId === DEFAULT_ADMIN_ROLE,
      ),
      pausers: roles.filter(
        (role) => role.contractScope === "ticket" && role.roleId === PAUSER_ROLE,
      ),
      scannerAdmins: roles.filter(
        (role) => role.contractScope === "checkin_registry" && role.roleId === SCANNER_ADMIN_ROLE,
      ),
      scanners: roles.filter(
        (role) => role.contractScope === "checkin_registry" && role.roleId === SCANNER_ROLE,
      ),
      extras: roles.filter(
        (role) =>
          !(
            (role.contractScope === "ticket" && role.roleId === DEFAULT_ADMIN_ROLE) ||
            (role.contractScope === "ticket" && role.roleId === PAUSER_ROLE) ||
            (role.contractScope === "checkin_registry" && role.roleId === SCANNER_ADMIN_ROLE) ||
            (role.contractScope === "checkin_registry" && role.roleId === SCANNER_ROLE)
          ),
      ),
    };
  }, [opsSummaryQuery.data?.roles]);
  const copy =
    locale === "fr"
      ? {
          title: "Organizer Cockpit",
          scannerMode: "Scanner Mode",
          salesResale: "Ventes & revente",
          settings: "Parametres",
          restrictedTitle: "Zone restreinte",
          restrictedImpact: "Les actions organizer ne peuvent pas etre signees par ce wallet.",
          restrictedAction: "Connectez un wallet admin gouvernance, admin scanner ou pauser.",
          systemPause: "Pause systeme",
          collectibleMode: "Mode collectible",
          listings: "Annonces",
          primaryPrice: "Prix primaire",
          operationalControls: "Controles operationnels",
          operationalSubtitle:
            "Les controles immediats restent sur des roles etroits, tandis que la gouvernance collectible suit un flux admin plus delibere.",
          immediateControls: "Controles immediats",
          immediateBody: "La pause reste disponible cote ops sans ouvrir un pouvoir de gouvernance plus large.",
          selectedEvent: "Evenement selectionne",
          operatorWallet: "Wallet operateur",
          totalMinted: "Total mint",
          notConnected: "Non connecte",
          deploymentVersion: "Set produit",
          versionV1: "Rails legacy",
          versionV2: "Set complet",
          rolloutTitle: "Etat du rollout produit",
          rolloutSubtitle:
            "On rend visible ce qui est vraiment live pour cet evenement, au lieu de laisser la stack technique seule raconter l'etat du produit.",
          rolloutCauseV1:
            "Cet evenement tourne encore sur le set legacy, donc Fan-Fuel, FanPass protege, assurance et merch ne sont pas actifs ici.",
          rolloutCauseV2:
            "Cet evenement porte deja le set business complet et peut servir de base a l'experience fan finale.",
          rolloutFanTitle: "Retention fan",
          rolloutAccessTitle: "Acces protege et revente",
          rolloutInsuranceTitle: "Assurance et oracle",
          rolloutCollectibleTitle: "Collectible et merch",
          rolloutLive: "Live",
          rolloutPartial: "Partiel",
          rolloutPlanned: "Inactif ici",
          rolloutStatus: "Statut",
          rolloutScore: "Score / perks",
          rolloutFuel: "Fan-Fuel",
          rolloutFanPass: "FanPass protege",
          rolloutRoyalty: "Royalty artiste",
          rolloutInsurance: "Assurance",
          rolloutOracle: "Oracle",
          rolloutCollectible: "Collectible",
          rolloutMerch: "Merch phygital",
          rolloutMissing: "Inactif ici",
          rolloutOnChain: "On-chain",
          rolloutConnected: "Connecte",
        }
      : {
          title: "Organizer Cockpit",
          scannerMode: "Scanner Mode",
          salesResale: "Sales & Resale",
          settings: "Settings",
          restrictedTitle: "Restricted area",
          restrictedImpact: "Organizer actions cannot be signed by this wallet.",
          restrictedAction: "Connect a governance admin, scanner admin, or pauser wallet.",
          systemPause: "System pause",
          collectibleMode: "Collectible mode",
          listings: "Listings",
          primaryPrice: "Primary price",
          operationalControls: "Operational controls",
          operationalSubtitle:
            "Immediate controls stay with narrow roles, while collectible governance remains a deliberate admin flow.",
          immediateControls: "Immediate controls",
          immediateBody: "Pause actions stay available to operations without granting broader governance power.",
          selectedEvent: "Selected event",
          operatorWallet: "Operator wallet",
          totalMinted: "Total minted",
          notConnected: "Not connected",
          deploymentVersion: "Product rail set",
          versionV1: "Legacy rails",
          versionV2: "Full rail set",
          rolloutTitle: "Product rollout status",
          rolloutSubtitle:
            "This makes the product state explicit for the selected event instead of expecting the contract map to tell the whole story.",
          rolloutCauseV1:
            "This event still runs on the legacy rail set, so Fan-Fuel, protected FanPass, insurance, and merch are not active here.",
          rolloutCauseV2:
            "This event already carries the full business rail set and can support the complete fan experience.",
          rolloutFanTitle: "Fan retention",
          rolloutAccessTitle: "Protected access and resale",
          rolloutInsuranceTitle: "Insurance and oracle",
          rolloutCollectibleTitle: "Collectible and merch",
          rolloutLive: "Live",
          rolloutPartial: "Partial",
          rolloutPlanned: "Inactive here",
          rolloutStatus: "Status",
          rolloutScore: "Score / perks",
          rolloutFuel: "Fan-Fuel",
          rolloutFanPass: "Protected FanPass",
          rolloutRoyalty: "Artist royalty",
          rolloutInsurance: "Insurance",
          rolloutOracle: "Oracle",
          rolloutCollectible: "Collectible",
          rolloutMerch: "Phygital merch",
          rolloutMissing: "Inactive here",
          rolloutOnChain: "On-chain",
          rolloutConnected: "Connected",
        };
  const rolloutCards = useMemo(
    () => [
      {
        key: "fan",
        title: copy.rolloutFanTitle,
        tone:
          isUpgradedEvent && selectedEvent?.fanScoreRegistry && selectedEvent?.perkManager
            ? ("success" as const)
            : isUpgradedEvent
              ? ("warning" as const)
              : ("default" as const),
        badge:
          isUpgradedEvent && selectedEvent?.fanScoreRegistry && selectedEvent?.perkManager
            ? copy.rolloutLive
            : isUpgradedEvent
              ? copy.rolloutPartial
              : copy.rolloutPlanned,
        body: isUpgradedEvent ? copy.rolloutCauseV2 : copy.rolloutCauseV1,
        entries: [
          {
            label: copy.rolloutScore,
            value:
              isUpgradedEvent && selectedEvent?.fanScoreRegistry && selectedEvent?.perkManager
                ? copy.rolloutOnChain
                : copy.rolloutMissing,
          },
          {
            label: copy.rolloutFuel,
            value:
              isUpgradedEvent && selectedEvent?.fanFuelBank
                ? copy.rolloutOnChain
                : copy.rolloutMissing,
          },
        ],
      },
      {
        key: "access",
        title: copy.rolloutAccessTitle,
        tone: isUpgradedEvent ? ("success" as const) : ("warning" as const),
        badge: isUpgradedEvent ? copy.rolloutLive : copy.rolloutPartial,
        body:
          locale === "fr"
            ? "Les regles de protection fan et la revente capee deviennent lisibles evenement par evenement."
            : "Fan protection rules and capped resale become legible event by event.",
        entries: [
          {
            label: copy.rolloutFanPass,
            value: isUpgradedEvent ? formatBps(selectedEvent?.fanPassAllocationBps) : copy.rolloutMissing,
          },
          {
            label: copy.rolloutRoyalty,
            value: isUpgradedEvent ? formatBps(selectedEvent?.artistRoyaltyBps) : copy.rolloutMissing,
          },
        ],
      },
      {
        key: "insurance",
        title: copy.rolloutInsuranceTitle,
        tone:
          isUpgradedEvent && selectedEvent?.insurancePool && selectedEvent?.oracleAdapter
            ? ("success" as const)
            : isUpgradedEvent
              ? ("warning" as const)
              : ("default" as const),
        badge:
          isUpgradedEvent && selectedEvent?.insurancePool && selectedEvent?.oracleAdapter
            ? copy.rolloutLive
            : isUpgradedEvent
              ? copy.rolloutPartial
              : copy.rolloutPlanned,
        body:
          locale === "fr"
            ? "La prime, le pool et le trigger oracle doivent etre visibles comme rails business distincts."
            : "The premium, pool, and oracle trigger should read as separate business rails.",
        entries: [
          {
            label: copy.rolloutInsurance,
            value:
              systemState?.insurancePremium !== undefined
                ? `${formatPol(systemState.insurancePremium)} POL`
                : copy.rolloutMissing,
          },
          {
            label: copy.rolloutOracle,
            value:
              isUpgradedEvent && selectedEvent?.oracleAdapter
                ? copy.rolloutConnected
                : copy.rolloutMissing,
          },
        ],
      },
      {
        key: "collectible",
        title: copy.rolloutCollectibleTitle,
        tone:
          isUpgradedEvent && selectedEvent?.collectibleContract && selectedEvent?.merchStore
            ? ("success" as const)
            : isUpgradedEvent || Boolean(systemState?.collectibleMode)
              ? ("warning" as const)
              : ("default" as const),
        badge:
          isUpgradedEvent && selectedEvent?.collectibleContract && selectedEvent?.merchStore
            ? copy.rolloutLive
            : isUpgradedEvent || Boolean(systemState?.collectibleMode)
              ? copy.rolloutPartial
              : copy.rolloutPlanned,
        body:
          locale === "fr"
            ? "Le souvenir post-check-in et le merch jumeau doivent vivre dans la meme histoire produit."
            : "Post-check-in souvenirs and twin merch should live in the same product story.",
        entries: [
          {
            label: copy.rolloutCollectible,
            value:
              isUpgradedEvent && selectedEvent?.collectibleContract
                ? systemState?.collectibleMode
                  ? "Mode live"
                  : "Contract wired"
                : Boolean(systemState?.collectibleMode)
                  ? "Alpha mode"
                  : copy.rolloutMissing,
          },
          {
            label: copy.rolloutMerch,
            value: isUpgradedEvent && selectedEvent?.merchStore ? "Store wired" : copy.rolloutMissing,
          },
        ],
      },
    ],
    [
      copy,
      isUpgradedEvent,
      locale,
      selectedEvent?.artistRoyaltyBps,
      selectedEvent?.collectibleContract,
      selectedEvent?.fanFuelBank,
      selectedEvent?.fanPassAllocationBps,
      selectedEvent?.fanScoreRegistry,
      selectedEvent?.insurancePool,
      selectedEvent?.merchStore,
      selectedEvent?.oracleAdapter,
      selectedEvent?.perkManager,
      systemState?.collectibleMode,
      systemState?.insurancePremium,
    ],
  );

  const runPauseToggle = async (shouldPause: boolean) => {
    if (!canPauseSystem) {
      setErrorMessage(t("organizerNeedsRole"));
      return;
    }

    await preparePreview({
      label: shouldPause ? "Pause system" : "Unpause system",
      description: shouldPause
        ? "Pause mint, list, buy, and scanner operations."
        : "Resume mint, list, buy, and scanner operations.",
      details: [
        "Requires PAUSER_ROLE on TicketNFT.",
        "Affects fan, scanner, and market actions instantly.",
      ],
      run: async (client) => {
        if (shouldPause) {
          if (!client.pauseSystem) {
            throw new Error("Pause method unavailable.");
          }
          return client.pauseSystem();
        }
        if (!client.unpauseSystem) {
          throw new Error("Unpause method unavailable.");
        }
        return client.unpauseSystem();
      },
    });
  };

  const runCollectibleToggle = async (enabled: boolean) => {
    if (!canGovern) {
      setErrorMessage("Governance admin role required for collectible mode.");
      return;
    }

    await preparePreview({
      label: enabled ? "Enable collectible mode" : "Disable collectible mode",
      description: "Toggle post-event collectible metadata mode.",
      details: [
        "Requires governance control over TicketNFT.",
        "In production this should flow through a timelock or multisig.",
        "Impacts tokenURI rendering for all tickets.",
      ],
      run: async (client) => {
        if (!client.setCollectibleMode) {
          throw new Error("Collectible mode method unavailable.");
        }
        return client.setCollectibleMode(enabled);
      },
    });
  };

  const runScannerRoleChange = async (mode: "grant" | "revoke") => {
    const targetAddress = scannerAddressInput.trim();
    if (!canManageScanners) {
      setErrorMessage("Scanner admin role required to manage venue operators.");
      return;
    }
    if (!isAddress(targetAddress)) {
      setErrorMessage("Enter a valid scanner wallet address.");
      return;
    }

    await preparePreview({
      label: mode === "grant" ? "Grant scanner role" : "Revoke scanner role",
      description:
        mode === "grant"
          ? "Authorize a venue wallet to submit irreversible check-ins."
          : "Remove scanner permissions from a venue wallet.",
      details: [
        "Requires SCANNER_ADMIN_ROLE on CheckInRegistry.",
        "Applies to scanner operations immediately after confirmation.",
        "Recommended governance path: timelock or multisig as long-term admin.",
      ],
      run: async (client) => {
        if (mode === "grant") {
          if (!client.grantScannerRole) {
            throw new Error("Grant scanner method unavailable.");
          }
          return client.grantScannerRole(targetAddress);
        }
        if (!client.revokeScannerRole) {
          throw new Error("Revoke scanner method unavailable.");
        }
        return client.revokeScannerRole(targetAddress);
      },
    });
  };

  const prepareGovernancePacket = (enabled: boolean) => {
    try {
      const packet = buildCollectibleModeGovernancePacket({
        desiredCollectibleMode: enabled,
        eventId: contractConfig.eventId,
        eventName: contractConfig.eventName,
        ticketNftAddress: contractConfig.ticketNftAddress,
        timelockAddress: runtimeConfig?.governanceTimelockAddress ?? null,
        timelockMinDelaySeconds: runtimeConfig?.governanceMinDelaySeconds ?? 0,
      });
      setGovernancePacket(packet);
      setStatusMessage(
        `${packet.actionLabel} packet ready for ${
          packet.mode === "timelock" ? "timelock" : "multisig"
        } review.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare governance packet.");
    }
  };

  const copyGovernanceText = async (label: string, value: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable in this browser.");
      }
      await navigator.clipboard.writeText(value);
      setStatusMessage(`${label} copied to clipboard.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Unable to copy ${label.toLowerCase()}.`);
    }
  };

  return (
    <div className="route-stack organizer-route" data-testid="organizer-page">
      <PageHeader
        title={copy.title}
        subtitle={
          locale === "fr"
            ? "Le bloc ops est isole du flux fan: monitoring, roles, scanner, gouvernance et signaux de marche vivent dans un espace pro dedie."
            : "The ops block is isolated from the fan flow: monitoring, roles, scanner, governance, and market signals live in a dedicated pro workspace."
        }
        workspace="organizer"
        context={
          <div className="inline-actions">
            <Tag tone={isUpgradedEvent ? "success" : "warning"}>
              {isUpgradedEvent ? copy.versionV2 : copy.versionV1}
            </Tag>
            <Tag tone={canGovern ? "success" : "warning"}>
              {canGovern ? "Governance admin" : "No governance admin"}
            </Tag>
            <Tag tone={canManageScanners ? "success" : "warning"}>
              {canManageScanners ? "Scanner admin" : "No scanner admin"}
            </Tag>
            <Tag tone={canPauseSystem ? "success" : "warning"}>
              {canPauseSystem ? "Pauser" : "No pauser"}
            </Tag>
          </div>
        }
        primaryAction={
          <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
            {t("refresh")}
          </button>
        }
        secondaryActions={
          <ButtonGroup compact>
            <Link to="/app/organizer/scanner" className="button-link ghost">
              {copy.scannerMode}
            </Link>
            <Link to="/app/organizer/sales" className="button-link ghost">
              {copy.salesResale}
            </Link>
            <Link to="/app/organizer/settings" className="button-link ghost">
              {copy.settings}
            </Link>
          </ButtonGroup>
        }
      />

      <Panel className="organizer-overview-panel" surface="glass">
        <SectionHeader
          title={copy.rolloutTitle}
          subtitle={copy.rolloutSubtitle}
        />
        <div className="organizer-cockpit-grid">
          {rolloutCards.map((card) => (
            <Card key={card.key} className="organizer-panel-card" surface="glass">
              <div className="inline-actions">
                <h3>{card.title}</h3>
                <Tag tone={card.tone}>{card.badge}</Tag>
              </div>
              <p>{card.body}</p>
              <InfoList entries={card.entries} />
            </Card>
          ))}
        </div>
      </Panel>

      {!hasOrganizerAccess ? (
        <RiskBanner
          tone="error"
          title={copy.restrictedTitle}
          cause={t("organizerNeedsRole")}
          impact={copy.restrictedImpact}
          action={copy.restrictedAction}
        />
      ) : null}

      <section className="ops-metric-grid">
        <Card className="ops-metric-card" surface="accent">
          <span>{copy.systemPause}</span>
          <strong>{systemState?.paused ? t("enabled") : t("disabled")}</strong>
        </Card>
        <Card className="ops-metric-card" surface="glass">
          <span>{copy.collectibleMode}</span>
          <strong>{systemState?.collectibleMode ? t("enabled") : t("disabled")}</strong>
        </Card>
        <Card className="ops-metric-card" surface="glass">
          <span>{copy.listings}</span>
          <strong>{marketStats?.listingCount ?? 0}</strong>
        </Card>
        <Card className="ops-metric-card" surface="glass">
          <span>{copy.primaryPrice}</span>
          <strong>{systemState ? `${formatPol(systemState.primaryPrice)} POL` : "-"}</strong>
        </Card>
      </section>

      <Panel className="organizer-overview-panel" surface="glass">
        <SectionHeader
          title={copy.operationalControls}
          subtitle={copy.operationalSubtitle}
        />

        <section className="organizer-cockpit-grid">
          <Card className="organizer-panel-card" surface="accent">
            <h3>{copy.immediateControls}</h3>
            <p>{copy.immediateBody}</p>
            <ButtonGroup>
              <button
                type="button"
                className="ghost"
                onClick={() => void runPauseToggle(true)}
                disabled={!canPauseSystem || Boolean(systemState?.paused)}
              >
                {t("pauseSystem")}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void runPauseToggle(false)}
                disabled={!canPauseSystem || !systemState?.paused}
              >
                {t("unpauseSystem")}
              </button>
            </ButtonGroup>
            <InfoList
              entries={[
                { label: copy.selectedEvent, value: contractConfig.eventName ?? contractConfig.eventId ?? "-" },
                { label: copy.operatorWallet, value: walletAddress || copy.notConnected },
                { label: copy.totalMinted, value: systemState?.totalMinted.toString() ?? "-" },
              ]}
            />
          </Card>

          <Card className="organizer-panel-card" surface="glass">
            <h3>Scanner role management</h3>
            <p>Grant or revoke venue scanning rights without handing out broad admin access.</p>
            <label>
              Scanner wallet
              <input
                value={scannerAddressInput}
                onChange={(event) => setScannerAddressInput(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <ButtonGroup>
              <button
                type="button"
                className="primary"
                onClick={() => void runScannerRoleChange("grant")}
                disabled={!canManageScanners}
              >
                Grant scanner
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void runScannerRoleChange("revoke")}
                disabled={!canManageScanners}
              >
                Revoke scanner
              </button>
            </ButtonGroup>
          </Card>

          <Card className="organizer-panel-card" surface="glass">
            <h3>Market pulse</h3>
            <InfoList
              entries={[
                { label: "Floor", value: marketStats?.floorPrice ? `${formatPol(marketStats.floorPrice)} POL` : "-" },
                {
                  label: "Median",
                  value: marketStats?.medianPrice ? `${formatPol(marketStats.medianPrice)} POL` : "-",
                },
                {
                  label: "Suggested list price",
                  value: marketStats?.suggestedListPrice ? `${formatPol(marketStats.suggestedListPrice)} POL` : "-",
                },
              ]}
            />
            <Link to="/app/organizer/sales" className="button-link ghost">
              Open sales workspace
            </Link>
          </Card>

          <Card className="organizer-panel-card" surface="glass">
            <h3>Active operator roster</h3>
            <p>Derived from indexed admin logs for the selected event.</p>
            {!bffClient ? (
              <p>Set a BFF API base URL to unlock indexed operator rosters.</p>
            ) : !indexedReadsAvailable ? (
              <p>The BFF is reachable but the indexed organizer read model is not ready yet.</p>
            ) : opsSummaryQuery.isLoading ? (
              <p>Loading indexed operator assignments...</p>
            ) : opsSummaryQuery.data ? (
              <>
                <InfoList
                  entries={[
                    { label: "Governance admins", value: groupedRoles.governanceAdmins.length },
                    { label: "Pausers", value: groupedRoles.pausers.length },
                    { label: "Scanner admins", value: groupedRoles.scannerAdmins.length },
                    { label: "Scanners", value: groupedRoles.scanners.length },
                  ]}
                />
                {[...groupedRoles.governanceAdmins, ...groupedRoles.pausers, ...groupedRoles.scannerAdmins, ...groupedRoles.scanners, ...groupedRoles.extras]
                  .length === 0 ? (
                  <p>No active operator roles have been indexed yet for this event.</p>
                ) : (
                  <ul className="plain-list">
                    {[...groupedRoles.governanceAdmins, ...groupedRoles.pausers, ...groupedRoles.scannerAdmins, ...groupedRoles.scanners, ...groupedRoles.extras].map((role) => (
                      <li key={`${role.contractScope}:${role.roleId}:${role.account}`}>
                        <strong>{labelRole(role)}:</strong> {formatAddress(role.account, 6)} | synced at block {role.updatedBlock}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p>Operator roster unavailable right now.</p>
            )}
          </Card>
        </section>
      </Panel>

      <Panel className="organizer-governance-panel" surface="glass">
        <SectionHeader
          title="Governance controls"
          subtitle="Collectible mode is intentionally split from day-to-day ops so the product feels more trustworthy."
        />
        <div className="organizer-cockpit-grid">
          <Card className="organizer-panel-card" surface="accent">
            <h3>Collectible mode</h3>
            <p>In production, this should travel through a timelock or multisig that owns admin rights.</p>
            <InfoList
              entries={[
                {
                  label: "Execution path",
                  value: canGovern
                    ? "Direct governance wallet available in this session"
                    : "Use timelock or multisig governance flow",
                },
                {
                  label: "Governance delay",
                  value: formatGovernanceDelay(runtimeConfig?.governanceMinDelaySeconds ?? 0),
                },
              ]}
            />
            <ButtonGroup>
              <button
                type="button"
                className="primary"
                onClick={() => void runCollectibleToggle(true)}
                disabled={!canGovern || Boolean(systemState?.collectibleMode)}
              >
                {t("enableCollectible")}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void runCollectibleToggle(false)}
                disabled={!canGovern || !systemState?.collectibleMode}
              >
                {t("disableCollectible")}
              </button>
            </ButtonGroup>
            <ButtonGroup compact>
              <button type="button" className="ghost" onClick={() => prepareGovernancePacket(true)}>
                Prepare enable packet
              </button>
              <button type="button" className="ghost" onClick={() => prepareGovernancePacket(false)}>
                Prepare disable packet
              </button>
              {runtimeConfig?.governancePortalUrl ? (
                <a
                  href={runtimeConfig.governancePortalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="button-link ghost"
                >
                  Open governance portal
                </a>
              ) : null}
            </ButtonGroup>
            {!canGovern ? (
              <p>No direct governance wallet is connected, so collectible mode changes stay read-only in ops.</p>
            ) : null}
          </Card>

          <Card className="organizer-panel-card" surface="glass">
            <h3>Governance packet</h3>
            {governancePacket ? (
              <div className="governance-packet-panel">
                <InfoList
                  entries={[
                    {
                      label: "Packet mode",
                      value:
                        governancePacket.mode === "timelock"
                          ? "TimelockController schedule + execute"
                          : "Direct calldata for multisig submission",
                    },
                    { label: "Prepared action", value: governancePacket.actionLabel },
                    { label: "Prepared at", value: governancePacket.createdAt },
                    {
                      label: "Selected event",
                      value: governancePacket.eventName ?? governancePacket.ticketEventId ?? "-",
                    },
                    {
                      label: "Delay",
                      value: governancePacket.timelock
                        ? formatGovernanceDelay(governancePacket.timelock.minDelaySeconds)
                        : "Managed by multisig policy",
                    },
                  ]}
                />
                <ul className="plain-list">
                  {governancePacket.instructions.map((instruction, index) => (
                    <li key={instruction.key}>
                      <strong>
                        {index + 1}. {instruction.title}
                      </strong>
                      <div>{instruction.summary}</div>
                      <div>Target: {instruction.call.target}</div>
                      <div>Function: {instruction.call.signature}</div>
                    </li>
                  ))}
                </ul>
                <ButtonGroup compact>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void copyGovernanceText("Governance packet JSON", governancePacketJson)}
                  >
                    Copy packet JSON
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() =>
                      void copyGovernanceText(
                        governancePacket.mode === "timelock" ? "Schedule calldata" : "Governance calldata",
                        governancePacket.instructions[0]?.call.calldata ?? governancePacket.directCall.calldata,
                      )
                    }
                  >
                    {governancePacket.mode === "timelock" ? "Copy schedule calldata" : "Copy calldata"}
                  </button>
                  {governancePacket.timelock ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        void copyGovernanceText(
                          "Execute calldata",
                          governancePacket.timelock?.executeCall.calldata ?? "",
                        )
                      }
                    >
                      Copy execute calldata
                    </button>
                  ) : null}
                </ButtonGroup>
                <label>
                  Governance packet JSON
                  <textarea
                    className="governance-packet-preview"
                    rows={14}
                    readOnly
                    spellCheck={false}
                    value={governancePacketJson}
                  />
                </label>
              </div>
            ) : (
              <p>Prepare a governance packet to hand off collectible mode changes to the timelock or multisig that owns admin rights.</p>
            )}
          </Card>

          <Card className="organizer-panel-card" surface="glass">
            <h3>Contract addresses</h3>
            <InfoList
              entries={[
                { label: "TicketNFT", value: contractConfig.ticketNftAddress },
                { label: "Marketplace", value: contractConfig.marketplaceAddress },
                { label: "CheckInRegistry", value: contractConfig.checkInRegistryAddress },
                ...(selectedEvent?.version === "v2"
                  ? [
                      { label: "CollectibleNFT", value: selectedEvent.collectibleContract ?? "-" },
                      { label: "FanScoreRegistry", value: selectedEvent.fanScoreRegistry ?? "-" },
                      { label: "FanFuelBank", value: selectedEvent.fanFuelBank ?? "-" },
                      { label: "PerkManager", value: selectedEvent.perkManager ?? "-" },
                      { label: "InsurancePool", value: selectedEvent.insurancePool ?? "-" },
                      { label: "OracleAdapter", value: selectedEvent.oracleAdapter ?? "-" },
                      { label: "MerchStore", value: selectedEvent.merchStore ?? "-" },
                    ]
                  : []),
              ]}
            />
            <p>Recommended governance posture: long-term admin rights belong behind a multisig or timelock.</p>
          </Card>

          {selectedEvent?.version === "v2" ? (
            <Card className="organizer-panel-card" surface="glass">
              <h3>Upgraded business rails</h3>
              <InfoList
                entries={[
                  { label: "Artist", value: selectedEvent.artistId ?? "-" },
                  { label: "Series", value: selectedEvent.seriesId ?? "-" },
                  { label: "Artist royalty", value: formatBps(selectedEvent.artistRoyaltyBps) },
                  { label: "FanPass allocation", value: formatBps(selectedEvent.fanPassAllocationBps) },
                  {
                    label: "Insurance premium",
                    value: systemState?.insurancePremium ? `${formatPol(systemState.insurancePremium)} POL` : "-",
                  },
                  {
                    label: "FanPass minted",
                    value:
                      systemState?.fanPassMinted !== undefined && systemState?.fanPassSupplyCap !== undefined
                        ? `${systemState.fanPassMinted.toString()} / ${systemState.fanPassSupplyCap.toString()}`
                        : "-",
                  },
                ]}
              />
            </Card>
          ) : null}

          <Card className="organizer-panel-card" surface="glass">
            <h3>Recent admin activity</h3>
            {!bffClient ? (
              <p>Connect the BFF to inspect recent role changes and pause actions.</p>
            ) : !indexedReadsAvailable ? (
              <p>Recent admin activity will appear here once the selected event is fully indexed by the BFF.</p>
            ) : opsSummaryQuery.isLoading ? (
              <p>Loading recent organizer activity...</p>
            ) : opsSummaryQuery.data?.recentActivity.length ? (
              <ul className="plain-list">
                {opsSummaryQuery.data.recentActivity.slice(0, 8).map((activity) => (
                  <li key={activity.id}>
                    <strong>{describeActivity(activity)}</strong>
                    <div>
                      Block {activity.blockNumber} | {activity.contractScope === "ticket" ? "TicketNFT" : "CheckInRegistry"}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No admin activity has been indexed yet for this event.</p>
            )}
          </Card>
        </div>
      </Panel>

      <DetailAccordion
        title="Operational controls"
        subtitle="Execution safeguards for organizer actions"
        defaultOpenDesktop={uiMode === "advanced"}
      >
        <ul className="plain-list">
          <li>Pause and unpause controls require pauser permissions.</li>
          <li>Scanner grants and revocations require scanner-admin permissions.</li>
          <li>Collectible mode changes are governance actions and should flow through a multisig or timelock.</li>
          <li>Displayed contract addresses should be governed by a multisig or timelock in production.</li>
          <li>Every protected action is routed through transaction preview before signing.</li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
