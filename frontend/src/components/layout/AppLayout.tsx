import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useI18n } from "../../i18n/I18nContext";
import { formatAddress, formatEventStart } from "../../lib/format";
import { getWorkspacePresentation } from "../../lib/workspaceContent";
import {
  ORGANIZER_SUBROUTE_PATHS,
  resolveOrganizerSubroute,
  resolveWorkspace,
  WORKSPACE_CONFIGS,
} from "../../lib/workspaceRouting";
import { useAppState } from "../../state/useAppState";
import type { EventDeployment } from "../../types/chainticket";
import { EventPoster } from "../events/EventPoster";
import { Badge, ButtonGroup, RiskBanner, Tag, Toast } from "../ui/Primitives";
import { OnboardingGuide } from "./OnboardingGuide";
import { TransactionPreviewDrawer } from "./TransactionPreviewDrawer";

function useIsMobileBreakpoint(maxWidth: number): boolean {
  const mediaQuery = `(max-width: ${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (typeof window.matchMedia !== "function") {
      return window.innerWidth <= maxWidth;
    }
    return window.matchMedia(mediaQuery).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (typeof window.matchMedia !== "function") {
      const onResize = () => {
        setIsMobile(window.innerWidth <= maxWidth);
      };

      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
      };
    }

    const media = window.matchMedia(mediaQuery);
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
    } else {
      media.addListener(onChange);
    }

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", onChange);
      } else {
        media.removeListener(onChange);
      }
    };
  }, [maxWidth, mediaQuery]);

  return isMobile;
}

function selectedEventLocation(event: {
  venueName?: string | null;
  city?: string | null;
  countryCode?: string | null;
} | null): string {
  if (!event) {
    return "";
  }
  return [event.venueName, event.city, event.countryCode].filter(Boolean).join(" | ");
}

function eventRailStatus(args: {
  event: EventDeployment | null;
  preferredEventId: string | null;
  locale: "fr" | "en";
}): { label: string; tone: "success" | "warning" | "info" | "default" } {
  const { event, preferredEventId, locale } = args;

  if (!event) {
    return {
      label: locale === "fr" ? "Aucun event" : "No event",
      tone: "default",
    };
  }

  if (event.ticketEventId === preferredEventId && event.version === "v2") {
    return {
      label: locale === "fr" ? "Stack complete live" : "Full stack live",
      tone: "success",
    };
  }

  if (event.version === "v2") {
    return {
      label: locale === "fr" ? "Rails avances live" : "Advanced rails live",
      tone: "info",
    };
  }

  if (event.isDemoInspired) {
    return {
      label: locale === "fr" ? "Demo legacy" : "Legacy demo",
      tone: "warning",
    };
  }

  return {
    label: locale === "fr" ? "Rails legacy" : "Legacy rails",
    tone: "default",
  };
}

export function AppLayout() {
  const { locale, t } = useI18n();
  const {
    walletProviders,
    selectedProviderId,
    setSelectedProviderId,
    embeddedWalletEnabled,
    embeddedWalletEmail,
    setEmbeddedWalletEmail,
    embeddedWalletCode,
    setEmbeddedWalletCode,
    embeddedWalletSession,
    embeddedWalletDevCode,
    isEmbeddedWalletBusy,
    requestEmbeddedWalletCode,
    verifyEmbeddedWalletCode,
    connectWallet,
    disconnectWallet,
    refreshDashboard,
    walletAddress,
    walletChainId,
    contractConfig,
    runtimeConfig,
    availableEvents,
    selectedEventId,
    setSelectedEventId,
    isConnecting,
    isRefreshing,
    statusMessage,
    errorMessage,
    bffMode,
    indexedReadsIssue,
    hasValidConfig,
    configIssues,
    systemState,
    walletCapRemaining,
    venueSafeMode,
    userRoles,
    connectedProvider,
  } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobileBreakpoint(940);

  const workspace = resolveWorkspace(location.pathname);
  const organizerSubroute = resolveOrganizerSubroute(location.pathname);
  const workspacePresentationMap = getWorkspacePresentation(locale);
  const workspacePresentation = workspacePresentationMap[workspace];
  const topbarCopy =
    locale === "fr"
      ? {
          brandTagline: "Billetterie de confiance",
          selectedEvent: "Evenement en focus",
          dedicatedOps: "Surface ops dediee",
          viewEvent: "Voir l'evenement",
          noOpsRole: "Aucun role ops",
          availableEvents: "Evenements disponibles",
          walletProvider: "Provider wallet",
          fullStackFocus: "Evenement complet live",
          fullStackBody:
            "Fan-Fuel, FanPass protege, assurance, collectible evolutif et merch phygital sont actifs sur ce show.",
          switchFocus: "Basculer le focus",
          openCanonicalEvent: "Ouvrir l'evenement",
          fanPassPill: "FanPass 30%",
          insurancePill: "Assurance live",
          merchPill: "Merch live",
          embeddedTitle: "Wallet embarque sponsorise",
          embeddedBody:
            "Connexion par e-mail, gas sponsorise par la plateforme pour le mint, l'assurance, les perks et le merch.",
          embeddedEmail: "E-mail fan",
          embeddedCode: "Code de verification",
          embeddedSend: "Envoyer le code",
          embeddedVerify: "Verifier et connecter",
          embeddedGas: "Gas sponsorise",
          embeddedBeta: "Wallet e-mail beta",
          embeddedOpsNote: "La revente et les actions organizer gardent MetaMask pour l'instant.",
          embeddedCodeHint: "Code de dev",
        }
      : {
          brandTagline: "Trusted ticketing",
          selectedEvent: "Selected event",
          dedicatedOps: "Dedicated ops surface",
          viewEvent: "View event",
          noOpsRole: "No ops role",
          availableEvents: "Available events",
          walletProvider: "Wallet provider",
          fullStackFocus: "Full-stack event live",
          fullStackBody:
            "Fan-Fuel, protected FanPass, insurance, evolving collectible, and phygital merch are active on this show.",
          switchFocus: "Switch focus",
          openCanonicalEvent: "Open event",
          fanPassPill: "FanPass 30%",
          insurancePill: "Insurance live",
          merchPill: "Merch live",
          embeddedTitle: "Sponsored embedded wallet",
          embeddedBody:
            "Email login with platform-sponsored gas for mint, insurance, perks, and merch.",
          embeddedEmail: "Fan email",
          embeddedCode: "Verification code",
          embeddedSend: "Send code",
          embeddedVerify: "Verify and connect",
          embeddedGas: "Gas sponsored",
          embeddedBeta: "Email wallet beta",
          embeddedOpsNote: "Resale and organizer actions still keep MetaMask for now.",
          embeddedCodeHint: "Dev code",
        };
  const currentEvent =
    availableEvents.find((event) => event.ticketEventId === selectedEventId) ??
    availableEvents[0] ??
    null;
  const canonicalEvent =
    availableEvents.find((event) => event.ticketEventId === runtimeConfig.defaultEventId) ??
    availableEvents.find((event) => event.version === "v2") ??
    null;
  const canonicalRailStatus = eventRailStatus({
    event: canonicalEvent,
    preferredEventId: runtimeConfig.defaultEventId,
    locale,
  });
  const currentRailStatus = eventRailStatus({
    event: currentEvent,
    preferredEventId: runtimeConfig.defaultEventId,
    locale,
  });
  const showCanonicalPrompt =
    Boolean(canonicalEvent) &&
    Boolean(currentEvent) &&
    canonicalEvent!.ticketEventId !== currentEvent!.ticketEventId;
  const walletStatusTone = walletChainId === contractConfig.chainId ? "success" : "warning";
  const selectedWalletProvider =
    walletProviders.find((provider) => provider.id === selectedProviderId) ?? walletProviders[0] ?? null;
  const showEmbeddedWalletPanel =
    embeddedWalletEnabled &&
    (selectedWalletProvider?.kind === "embedded" || connectedProvider?.kind === "embedded");
  const usingEmbeddedWallet =
    connectedProvider?.kind === "embedded" || selectedWalletProvider?.kind === "embedded";
  const mainNavigation = useMemo(
    () =>
      [
        {
          key: "explore",
          to: WORKSPACE_CONFIGS.explore.path,
          label: getWorkspacePresentation(locale).explore.label,
        },
        {
          key: "marketplace",
          to: WORKSPACE_CONFIGS.marketplace.path,
          label: getWorkspacePresentation(locale).marketplace.label,
        },
        {
          key: "tickets",
          to: WORKSPACE_CONFIGS.tickets.path,
          label: getWorkspacePresentation(locale).tickets.label,
        },
        {
          key: "organizer",
          to: WORKSPACE_CONFIGS.organizer.path,
          label: getWorkspacePresentation(locale).organizer.label,
        },
      ] as const,
    [locale],
  );
  const organizerNavigation = useMemo(
    () =>
      [
        {
          key: "overview",
          to: ORGANIZER_SUBROUTE_PATHS.overview,
          label: locale === "fr" ? "Cockpit" : "Cockpit",
        },
        {
          key: "scanner",
          to: ORGANIZER_SUBROUTE_PATHS.scanner,
          label: locale === "fr" ? "Scanner Mode" : "Scanner Mode",
        },
        {
          key: "sales",
          to: ORGANIZER_SUBROUTE_PATHS.sales,
          label: locale === "fr" ? "Ventes & revente" : "Sales & Resale",
        },
        {
          key: "settings",
          to: ORGANIZER_SUBROUTE_PATHS.settings,
          label: locale === "fr" ? "Parametres" : "Settings",
        },
      ] as const,
    [locale],
  );
  const roleTags = useMemo(() => {
    const tags: string[] = [];
    if (userRoles.isAdmin) {
      tags.push(locale === "fr" ? "Admin gouvernance" : "Governance admin");
    }
    if (userRoles.isScannerAdmin) {
      tags.push(locale === "fr" ? "Admin scanner" : "Scanner admin");
    }
    if (userRoles.isPauser) {
      tags.push(locale === "fr" ? "Role pause" : "Pauser");
    }
    if (userRoles.isScanner) {
      tags.push(locale === "fr" ? "Scanner terrain" : "Scanner");
    }
    return tags;
  }, [locale, userRoles.isAdmin, userRoles.isPauser, userRoles.isScanner, userRoles.isScannerAdmin]);

  const handleEventSwitch = (eventId: string) => {
    setSelectedEventId(eventId);
    if (workspace === "explore") {
      void navigate(`/app/explore/${eventId}`);
    }
  };

  return (
    <div
      className={[
        "workspace-page",
        `workspace-${workspace}`,
        `workspace-accent-${WORKSPACE_CONFIGS[workspace].accent}`,
        venueSafeMode ? "venue-safe" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>
      <div className="workspace-glow workspace-glow-a" aria-hidden="true" />
      <div className="workspace-glow workspace-glow-b" aria-hidden="true" />
      <div className="workspace-grid-pattern" aria-hidden="true" />

      <div className="workspace-shell">
        <header className="workspace-topbar">
          <div className="workspace-topbar-primary">
            <div className="workspace-brand-lockup">
              <Link to={WORKSPACE_CONFIGS.explore.path} className="workspace-brand-mark">
                <span>CT</span>
              </Link>
              <div className="workspace-brand-copy">
                <p>ChainTicket</p>
                <strong>{topbarCopy.brandTagline}</strong>
              </div>
            </div>

            <nav className="workspace-main-nav" aria-label="Primary navigation">
              {mainNavigation.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "workspace-main-link active" : "workspace-main-link"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="workspace-utility-cluster">
            <div className="workspace-network-chip">
              <Badge tone={walletStatusTone}>
                {walletChainId === contractConfig.chainId
                  ? t("networkSecure", { chainName: contractConfig.chainName })
                  : t("networkNotConnected")}
              </Badge>
              <span className="workspace-wallet-text">
                {walletAddress ? formatAddress(walletAddress, 6) : t("networkNotConnected")}
              </span>
              {usingEmbeddedWallet ? <Tag tone="info">{topbarCopy.embeddedBeta}</Tag> : null}
            </div>

            <ButtonGroup compact>
              <select
                className="wallet-select workspace-provider-select"
                value={selectedProviderId}
                onChange={(event) => setSelectedProviderId(event.target.value)}
                aria-label={topbarCopy.walletProvider}
              >
                {walletProviders.length === 0 ? <option value="">{t("noWalletFound")}</option> : null}
                {walletProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.kind === "embedded"
                      ? `${provider.name} · ${topbarCopy.embeddedGas}`
                      : provider.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={walletAddress ? "ghost" : "primary"}
                onClick={() => void connectWallet()}
                disabled={isConnecting || !hasValidConfig || walletProviders.length === 0}
              >
                {isConnecting
                  ? t("connecting")
                  : selectedWalletProvider?.kind === "embedded" && !walletAddress
                    ? embeddedWalletCode.trim().length > 0
                      ? topbarCopy.embeddedVerify
                      : topbarCopy.embeddedSend
                  : walletAddress
                    ? t("reconnectWallet")
                    : t("connectWallet")}
              </button>
              {walletAddress ? (
                <button type="button" className="ghost" onClick={disconnectWallet}>
                  {t("disconnectWallet")}
                </button>
              ) : null}
              <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
                {isRefreshing ? t("refreshing") : t("refresh")}
              </button>
            </ButtonGroup>
          </div>
        </header>

        {showEmbeddedWalletPanel ? (
          <section className="workspace-embedded-panel" data-testid="embedded-wallet-panel">
            <div className="workspace-embedded-copy">
              <div className="workspace-embedded-heading">
                <strong>{topbarCopy.embeddedTitle}</strong>
                <Tag tone="info">{topbarCopy.embeddedBeta}</Tag>
                <Tag tone="success">{topbarCopy.embeddedGas}</Tag>
              </div>
              <p>{topbarCopy.embeddedBody}</p>
              <small>{topbarCopy.embeddedOpsNote}</small>
            </div>

            <div className="workspace-embedded-form">
              <label className="workspace-embedded-field">
                <span>{topbarCopy.embeddedEmail}</span>
                <input
                  type="email"
                  value={embeddedWalletEmail}
                  onChange={(event) => setEmbeddedWalletEmail(event.target.value)}
                  placeholder="fan@chainticket.xyz"
                  disabled={isConnecting || isEmbeddedWalletBusy}
                />
              </label>

              <label className="workspace-embedded-field">
                <span>{topbarCopy.embeddedCode}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={embeddedWalletCode}
                  onChange={(event) => setEmbeddedWalletCode(event.target.value)}
                  placeholder="123456"
                  disabled={isConnecting || isEmbeddedWalletBusy}
                />
              </label>

              <ButtonGroup compact>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void requestEmbeddedWalletCode()}
                  disabled={isConnecting || isEmbeddedWalletBusy}
                >
                  {topbarCopy.embeddedSend}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void verifyEmbeddedWalletCode()}
                  disabled={isConnecting || isEmbeddedWalletBusy}
                >
                  {topbarCopy.embeddedVerify}
                </button>
              </ButtonGroup>
            </div>

            <div className="workspace-embedded-meta">
              {embeddedWalletSession ? (
                <>
                  <Tag tone="success">{formatAddress(embeddedWalletSession.walletAddress, 6)}</Tag>
                  <Tag tone="default">{embeddedWalletSession.email}</Tag>
                </>
              ) : null}
              {embeddedWalletDevCode ? (
                <Tag tone="warning">
                  {topbarCopy.embeddedCodeHint}: {embeddedWalletDevCode}
                </Tag>
              ) : null}
            </div>
          </section>
        ) : null}

        <section
          className={[
            "workspace-hero",
            workspace === "explore" ? undefined : "workspace-hero-compact",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="workspace-hero-copy">
            <p className="workspace-hero-eyebrow">{workspacePresentation.eyebrow}</p>
            <h1>{workspacePresentation.label}</h1>
            <p>{workspacePresentation.summary}</p>
            <div className="workspace-hero-meta">
              <Tag tone={systemState?.paused ? "danger" : "success"}>
                {locale === "fr" ? "System" : "System"}:{" "}
                {systemState?.paused ? t("paused") : t("active")}
              </Tag>
              <Tag tone={systemState?.collectibleMode ? "info" : "default"}>
                {t("collectibleMode")}: {systemState?.collectibleMode ? t("enabled") : t("disabled")}
              </Tag>
              <Tag tone="info">
                {t("walletCapRemaining")}: {walletCapRemaining !== null ? walletCapRemaining.toString() : "-"}
              </Tag>
              <Tag tone={currentRailStatus.tone}>{currentRailStatus.label}</Tag>
              {workspace === "explore" && currentEvent?.category ? (
                <Tag tone="default">{currentEvent.category}</Tag>
              ) : null}
            </div>
          </div>

          {workspace === "organizer" ? (
            <div className="workspace-hero-side workspace-hero-side-ops">
              <div className="workspace-ops-snapshot">
                <small>{topbarCopy.selectedEvent}</small>
                <strong>{currentEvent?.name ?? contractConfig.eventName ?? "ChainTicket"}</strong>
                <span>
                  {selectedEventLocation(currentEvent) ||
                    topbarCopy.dedicatedOps}
                </span>
                <div className="workspace-event-status-row">
                  <Tag tone={currentRailStatus.tone}>{currentRailStatus.label}</Tag>
                  {currentEvent?.version === "v2" && currentEvent?.fanPassAllocationBps ? (
                    <Tag tone="default">
                      {topbarCopy.fanPassPill}
                    </Tag>
                  ) : null}
                </div>
              </div>
              <div className="workspace-role-row">
                {roleTags.length === 0 ? (
                  <Tag tone="warning">{topbarCopy.noOpsRole}</Tag>
                ) : (
                  roleTags.map((role) => (
                    <Tag key={role} tone="info">
                      {role}
                    </Tag>
                  ))
                )}
              </div>
            </div>
          ) : currentEvent ? (
            <div className="workspace-hero-side">
              <div className="workspace-event-card">
                <EventPoster event={currentEvent} className="workspace-event-poster" />
                <div className="workspace-event-copy">
                  <small>{topbarCopy.selectedEvent}</small>
                  <strong>{currentEvent.name}</strong>
                  <span>{formatEventStart(currentEvent.startsAt)}</span>
                  <em>{selectedEventLocation(currentEvent) || currentEvent.ticketEventId}</em>
                  <div className="workspace-event-status-row">
                    <Tag tone={currentRailStatus.tone}>{currentRailStatus.label}</Tag>
                    {currentEvent.version === "v2" && currentEvent.fanPassAllocationBps ? (
                      <Tag tone="default">{topbarCopy.fanPassPill}</Tag>
                    ) : null}
                    {currentEvent.version === "v2" && currentEvent.insurancePool ? (
                      <Tag tone="info">{topbarCopy.insurancePill}</Tag>
                    ) : null}
                  </div>
                  <Link
                    to={`/app/explore/${currentEvent.ticketEventId}`}
                    className="button-link ghost compact-link"
                  >
                    {topbarCopy.viewEvent}
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {showCanonicalPrompt && canonicalEvent ? (
          <section className="workspace-canonical-banner" data-testid="workspace-canonical-banner">
            <div className="workspace-canonical-copy">
              <small>{topbarCopy.fullStackFocus}</small>
              <strong>{canonicalEvent.name}</strong>
              <p>{topbarCopy.fullStackBody}</p>
            </div>
            <div className="workspace-canonical-actions">
              <Tag tone={canonicalRailStatus.tone}>{canonicalRailStatus.label}</Tag>
              <ButtonGroup compact>
                <button
                  type="button"
                  className="primary"
                  onClick={() => handleEventSwitch(canonicalEvent.ticketEventId)}
                >
                  {topbarCopy.switchFocus}
                </button>
                <Link
                  to={`/app/explore/${canonicalEvent.ticketEventId}`}
                  className="button-link ghost"
                  onClick={() => handleEventSwitch(canonicalEvent.ticketEventId)}
                >
                  {topbarCopy.openCanonicalEvent}
                </Link>
              </ButtonGroup>
            </div>
          </section>
        ) : null}

        {availableEvents.length > 1 ? (
          <section className="workspace-event-strip" aria-label={topbarCopy.availableEvents}>
            {availableEvents.map((event) => {
              const eventStatus = eventRailStatus({
                event,
                preferredEventId: runtimeConfig.defaultEventId,
                locale,
              });

              return (
                <button
                  key={event.ticketEventId}
                  type="button"
                  className={event.ticketEventId === selectedEventId ? "workspace-event-pill active" : "workspace-event-pill"}
                  onClick={() => handleEventSwitch(event.ticketEventId)}
                >
                  <div className="workspace-event-pill-copy">
                    <strong>{event.name}</strong>
                    <span>{formatEventStart(event.startsAt)}</span>
                  </div>
                  <div className="workspace-event-pill-meta">
                    <Tag tone={eventStatus.tone}>{eventStatus.label}</Tag>
                    {event.version === "v2" && event.fanPassAllocationBps ? (
                      <Tag tone="default">{topbarCopy.fanPassPill}</Tag>
                    ) : null}
                    {event.version === "v2" && event.insurancePool ? (
                      <Tag tone="info">{topbarCopy.insurancePill}</Tag>
                    ) : null}
                    {event.version === "v2" && event.merchStore ? (
                      <Tag tone="default">{topbarCopy.merchPill}</Tag>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </section>
        ) : null}

        {workspace === "organizer" ? (
          <nav className="workspace-subnav" aria-label="Organizer navigation">
            {organizerNavigation.map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.key === "overview"}
                className={item.key === organizerSubroute ? "workspace-subnav-link active" : "workspace-subnav-link"}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        ) : null}

        {statusMessage || errorMessage ? (
          <section className="status-stack" aria-live="polite">
            {statusMessage ? (
              <Toast tone="success" title={t("toastSuccessTitle")} message={statusMessage} />
            ) : null}
            {errorMessage ? (
              <Toast tone="danger" title={t("toastErrorTitle")} message={errorMessage} />
            ) : null}
          </section>
        ) : null}

        {!hasValidConfig ? (
          <RiskBanner
            tone="error"
            title={locale === "fr" ? "Configuration frontend bloquante" : "Frontend configuration blocked"}
            cause={configIssues.join(" | ")}
            impact={
              locale === "fr"
                ? "Le wallet et les lectures on-chain restent indisponibles tant que l'environnement est incomplet."
                : "Wallet and on-chain reads stay unavailable until the environment is corrected."
            }
            action={
              locale === "fr"
                ? "Mettez a jour frontend/.env avec les variables VITE_* puis relancez l'application."
                : "Update frontend/.env with VITE_* keys, then restart the app."
            }
          />
        ) : null}

        {hasValidConfig && runtimeConfig.apiBaseUrl && indexedReadsIssue ? (
          <RiskBanner
            tone={bffMode === "offline" ? "error" : "warning"}
            title={locale === "fr" ? "Lectures indexees indisponibles" : "Indexed reads unavailable"}
            cause={indexedReadsIssue}
            impact={
              locale === "fr"
                ? "Les vues enrichies du marche, des billets et de l'ops restent degradees jusqu'au rattrapage du BFF."
                : "Enriched marketplace, tickets, and ops views stay degraded until the BFF catches up."
            }
            action={
              locale === "fr"
                ? "Gardez le BFF actif, confirmez le deployment block, puis laissez l'indexation finir."
                : "Keep the BFF running, confirm the deployment block, and let indexing catch up."
            }
          />
        ) : null}

        <main className="workspace-content-shell" id="main-content">
          <section className="workspace-content">
            <Outlet />
          </section>
        </main>
      </div>

      {isMobile ? (
        <nav className="bottom-nav" aria-label="Primary mobile navigation">
          {mainNavigation.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) => (isActive ? "bottom-link active" : "bottom-link")}
            >
              <span className="bottom-glyph" aria-hidden="true">
                {item.label.slice(0, 1)}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      ) : null}

      <OnboardingGuide />
      <TransactionPreviewDrawer />
    </div>
  );
}
