import { Link } from "react-router-dom";

import {
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  InfoList,
  PageHeader,
  Panel,
  SegmentedToggle,
  Tag,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { useAppState } from "../state/useAppState";

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const {
    runtimeConfig,
    venueSafeMode,
    setVenueSafeMode,
    userRoles,
    bffMode,
    uiMode,
    setUiMode,
    setOnboardingSeen,
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
    connectedProvider,
  } = useAppState();

  const roleBadges: string[] = [];
  if (userRoles.isAdmin) {
    roleBadges.push(locale === "fr" ? "Admin gouvernance" : "Governance admin");
  }
  if (userRoles.isScannerAdmin) {
    roleBadges.push(locale === "fr" ? "Admin scanner" : "Scanner admin");
  }
  if (userRoles.isPauser) {
    roleBadges.push(t("rolePauser"));
  }
  if (userRoles.isScanner) {
    roleBadges.push(t("roleScanner"));
  }

  return (
    <div className="route-stack settings-route" data-testid="settings-page">
      <PageHeader
        title={locale === "fr" ? "Parametres Organizer" : "Organizer settings"}
        subtitle={
          locale === "fr"
            ? "Le flux fan reste propre pendant que les reglages de langue, de securite et de diagnostic vivent cote ops."
            : "Fan-facing flows stay clean while language, safety, and diagnostic controls live on the ops side."
        }
        workspace="organizer"
        context={
          <Badge tone="info" emphasis="solid">
            {locale === "fr" ? "Profil ops" : "Operations profile"}
          </Badge>
        }
        secondaryActions={
          <Link to="/app/organizer" className="button-link ghost">
            Organizer Cockpit
          </Link>
        }
      />

      <Panel className="primary-panel" surface="glass">
        <section className="settings-grid">
          <Card surface="accent">
            <h3>{locale === "fr" ? "Langue et affichage" : "Language and display"}</h3>
            <p>
              {locale === "fr"
                ? "Choisissez la langue de toutes les pages et le niveau d'accompagnement voulu dans l'interface."
                : "Select the language used across all pages and choose how guided the workspace should feel."}
            </p>
            <SegmentedToggle<"fr" | "en">
              value={locale}
              onChange={setLocale}
              options={[
                { value: "fr", label: "FR" },
                { value: "en", label: "EN" },
              ]}
            />
            <p>{t("uiModeLabel")}</p>
            <SegmentedToggle<"guide" | "advanced">
              value={uiMode}
              onChange={setUiMode}
              options={[
                { value: "guide", label: t("uiModeGuide") },
                { value: "advanced", label: t("uiModeAdvanced") },
              ]}
            />
            <ButtonGroup>
              <button type="button" className="ghost" onClick={() => setOnboardingSeen(false)}>
                {t("reviewGuide")}
              </button>
            </ButtonGroup>
          </Card>

          <Card surface="glass">
            <h3>{locale === "fr" ? "Securite" : "Safety"}</h3>
            <p>{t("venueSafeHint")}</p>
            <ButtonGroup>
              <button
                type="button"
                className={venueSafeMode ? "primary" : "ghost"}
                onClick={() => setVenueSafeMode(!venueSafeMode)}
              >
                {venueSafeMode ? t("enabled") : t("disabled")}
              </button>
            </ButtonGroup>
            <div className="inline-actions">
              {roleBadges.length === 0 ? <p>{t("roleNone")}</p> : null}
              {roleBadges.map((role) => (
                <Tag key={role} tone="success">
                  {role}
                </Tag>
              ))}
            </div>
          </Card>

          <Card surface="glass">
            <h3>{locale === "fr" ? "Environnement" : "Environment"}</h3>
            <InfoList
              entries={[
                { label: t("chainEnv"), value: runtimeConfig.chainEnv },
                { label: t("apiBaseUrl"), value: runtimeConfig.apiBaseUrl ?? (locale === "fr" ? "Non configure" : "Not configured") },
                {
                  label: locale === "fr" ? "Timelock de gouvernance" : "Governance timelock",
                  value: runtimeConfig.governanceTimelockAddress ?? (locale === "fr" ? "Non configure" : "Not configured"),
                },
                { label: locale === "fr" ? "Delai de gouvernance" : "Governance delay", value: `${runtimeConfig.governanceMinDelaySeconds}s` },
                {
                  label: locale === "fr" ? "Portail de gouvernance" : "Governance portal",
                  value: runtimeConfig.governancePortalUrl ?? (locale === "fr" ? "Non configure" : "Not configured"),
                },
                {
                  label: t("featureFlags"),
                  value: runtimeConfig.featureFlags.length ? runtimeConfig.featureFlags.join(", ") : locale === "fr" ? "Aucun" : "None",
                },
                { label: t("fallbackMode"), value: bffMode },
              ]}
            />
          </Card>

          <Card surface="glass">
            <h3>{locale === "fr" ? "Wallet embarque" : "Embedded wallet"}</h3>
            <p>
              {locale === "fr"
                ? "Ce rail email + gas sponsorise couvre le mint, l'assurance, les perks et le merch pour les fans non-crypto."
                : "This email + sponsored gas rail covers mint, insurance, perks, and merch for non-crypto fans."}
            </p>
            <InfoList
              entries={[
                {
                  label: locale === "fr" ? "Etat" : "Status",
                  value: embeddedWalletEnabled
                    ? embeddedWalletSession
                      ? locale === "fr"
                        ? "Connecte"
                        : "Connected"
                      : locale === "fr"
                        ? "Pret"
                        : "Ready"
                    : locale === "fr"
                      ? "Desactive"
                      : "Disabled",
                },
                {
                  label: locale === "fr" ? "Provider actif" : "Active provider",
                  value:
                    connectedProvider?.kind === "embedded"
                      ? connectedProvider.name
                      : locale === "fr"
                        ? "MetaMask / injecte"
                        : "MetaMask / injected",
                },
                {
                  label: locale === "fr" ? "Wallet fan" : "Fan wallet",
                  value: embeddedWalletSession?.walletAddress ?? (locale === "fr" ? "Pas encore connecte" : "Not connected yet"),
                },
              ]}
            />
            {embeddedWalletEnabled ? (
              <>
                <input
                  type="email"
                  value={embeddedWalletEmail}
                  onChange={(event) => setEmbeddedWalletEmail(event.target.value)}
                  placeholder="fan@chainticket.xyz"
                  aria-label={locale === "fr" ? "Email embedded wallet" : "Embedded wallet email"}
                />
                <input
                  type="text"
                  value={embeddedWalletCode}
                  onChange={(event) => setEmbeddedWalletCode(event.target.value)}
                  placeholder="123456"
                  aria-label={locale === "fr" ? "Code embedded wallet" : "Embedded wallet code"}
                />
                <ButtonGroup>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void requestEmbeddedWalletCode()}
                    disabled={isEmbeddedWalletBusy}
                  >
                    {locale === "fr" ? "Envoyer le code" : "Send code"}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void verifyEmbeddedWalletCode()}
                    disabled={isEmbeddedWalletBusy}
                  >
                    {locale === "fr" ? "Verifier" : "Verify"}
                  </button>
                </ButtonGroup>
                {embeddedWalletDevCode ? (
                  <Tag tone="warning">
                    {locale === "fr" ? "Code dev" : "Dev code"}: {embeddedWalletDevCode}
                  </Tag>
                ) : null}
              </>
            ) : null}
          </Card>
        </section>
      </Panel>

      <DetailAccordion
        title={locale === "fr" ? "Notes environnement" : "Environment notes"}
        subtitle={locale === "fr" ? "A lire avant de modifier la configuration de deploiement" : "Read before changing deployment configuration"}
        defaultOpenDesktop={uiMode === "advanced"}
      >
        <ul className="plain-list">
          <li>{t("fallbackModeHint")}</li>
          <li>
            {locale === "fr"
              ? "Les feature flags sont en lecture seule dans cette UI et controles par les variables d'environnement."
              : "Feature flags are read-only in this UI and controlled by environment variables."}
          </li>
          <li>
            {locale === "fr"
              ? "Les badges de roles se mettent a jour automatiquement quand le compte wallet change."
              : "Role badges update automatically when wallet account changes."}
          </li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
