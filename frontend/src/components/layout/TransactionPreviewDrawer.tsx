import { useI18n } from "../../i18n/I18nContext";
import { useAppState } from "../../state/useAppState";
import { Badge, ButtonGroup, InfoList, Panel, RiskBanner } from "../ui/Primitives";

function preflightSummary(
  locale: ReturnType<typeof useI18n>["locale"],
  t: ReturnType<typeof useI18n>["t"],
  preflight: { ok: boolean; blockers: string[] } | null,
): string {
  if (!preflight) {
    return locale === "fr" ? "Aucun pre-check pour cette action." : "No pre-check for this action.";
  }
  if (preflight.ok) {
    return t("preflightPassed");
  }
  return t("preflightBlocked", { reasons: preflight.blockers.join(" | ") });
}

export function TransactionPreviewDrawer() {
  const { locale, t } = useI18n();
  const { pendingPreview, setPendingPreview, confirmPendingPreview } = useAppState();

  if (!pendingPreview) {
    return null;
  }

  const impactSummary = (() => {
    if (!pendingPreview.action) {
      return t("previewImpactGeneric");
    }
    switch (pendingPreview.action.type) {
      case "mint":
      case "mint_standard":
      case "mint_fanpass":
        return t("previewImpactMint");
      case "approve":
        return t("previewImpactApprove");
      case "checkin_mark_used":
        return locale === "fr"
          ? "Le ticket est marque comme utilise on-chain et ne peut plus servir a l'entree."
          : "The ticket is marked used on-chain and can no longer be used for venue entry.";
      case "checkin_transform":
        return locale === "fr"
          ? "Le ticket est consomme a l'entree puis transforme en collectible envoye au wallet du fan."
          : "The ticket is consumed at check-in and transformed into a collectible sent to the fan wallet.";
      case "claim_insurance":
        return locale === "fr"
          ? "Le smart contract d'assurance tente de verser le remboursement au wallet proprietaire si l'oracle a ouvert la couverture."
          : "The insurance contract attempts to pay the ticket owner if the oracle has opened the coverage window.";
      case "redeem_perk":
        return locale === "fr"
          ? "Le perk est consomme on-chain pour ce fan et peut depenser du FanFuel selon les regles d'acces configurees."
          : "The perk is redeemed on-chain for this fan and may spend FanFuel based on its configured access rules.";
      case "redeem_merch":
        return locale === "fr"
          ? "Le FanFuel est depense on-chain et un twin NFT de merchandising est mint pour prouver l'authenticite de l'objet."
          : "FanFuel is spent on-chain and a merch twin NFT is minted to prove product authenticity.";
      case "list":
      case "list_with_permit":
        return t("previewImpactList");
      case "cancel":
        return t("previewImpactCancel");
      case "buy":
        return t("previewImpactBuy");
      case "organizer_buyback":
        return locale === "fr"
          ? "Le FanPass revient au stock organisateur au prix primaire et le vendeur est rembourse."
          : "The FanPass returns to organizer inventory at primary price and the seller is repaid.";
      default:
        return t("previewImpactGeneric");
    }
  })();

  const blockers = pendingPreview.preflight?.blockers ?? [];
  const warnings = pendingPreview.preflight?.warnings ?? [];
  const precheckTone = !pendingPreview.preflight
    ? "warning"
    : pendingPreview.preflight.ok
      ? "success"
      : "error";
  const canConfirm = pendingPreview.preflight ? pendingPreview.preflight.ok : true;
  const needsApprovalGuidance =
    (pendingPreview.action?.type === "list" ||
      pendingPreview.action?.type === "organizer_buyback") &&
    blockers.some((blocker) => blocker.includes("Marketplace approval missing"));

  return (
    <div
      className="preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("txPreviewTitle")}
    >
      <Panel className="preview-drawer">
        <header className="preview-header">
          <h2>{pendingPreview.label}</h2>
          <Badge tone={pendingPreview.preflight?.ok ? "success" : "warning"}>
            {pendingPreview.preflight?.ok
              ? locale === "fr"
                ? "Pret a signer"
                : "Safe to sign"
              : locale === "fr"
                ? "Verification requise"
                : "Check required"}
          </Badge>
        </header>
        <p>{pendingPreview.description}</p>

        <RiskBanner
          tone={precheckTone}
          title={t("previewRiskTitle")}
          cause={preflightSummary(locale, t, pendingPreview.preflight)}
          impact={impactSummary}
          action={blockers.length > 0 ? blockers.join(" | ") : t("previewRiskActionClear")}
        />

        <InfoList
          entries={[
            {
              label: t("preflightStatus"),
              value: preflightSummary(locale, t, pendingPreview.preflight),
            },
            {
              label: t("estimatedGas"),
              value:
                pendingPreview.preflight?.gasEstimate !== null &&
                pendingPreview.preflight?.gasEstimate !== undefined
                  ? pendingPreview.preflight.gasEstimate.toString()
                  : locale === "fr"
                    ? "n/d"
                    : "n/a",
            },
          ]}
        />

        {warnings.length > 0 ? (
          <InfoList
            entries={warnings.map((warning, index) => ({
              label: locale === "fr" ? `Alerte ${index + 1}` : `Warning ${index + 1}`,
              value: warning,
            }))}
          />
        ) : null}

        {needsApprovalGuidance ? (
          <RiskBanner
            tone="warning"
            title={locale === "fr" ? "Approbation requise d'abord" : "Approval needed first"}
            cause={
              locale === "fr"
                ? "Ce billet n'a pas encore ete approuve pour le marketplace."
                : "This ticket has not been approved for the marketplace yet."
            }
            impact={
              locale === "fr"
                ? pendingPreview.action?.type === "organizer_buyback"
                  ? "Le buyback ne peut pas etre signe tant que l'approbation marketplace du FanPass n'est pas confirmee."
                  : "La mise en vente ne peut pas etre signee tant que l'approbation n'est pas confirmee."
                : pendingPreview.action?.type === "organizer_buyback"
                  ? "Buyback cannot be signed until marketplace approval for the FanPass is confirmed."
                  : "Listing cannot be signed until the approval transaction is confirmed."
            }
            action={
              locale === "fr"
                ? pendingPreview.action?.type === "organizer_buyback"
                  ? "Fermez ce drawer, faites approuver le FanPass pour le marketplace, puis relancez le buyback."
                  : "Fermez ce drawer, lancez l'approbation, puis rouvrez l'apercu de mise en vente."
                : pendingPreview.action?.type === "organizer_buyback"
                  ? "Close this drawer, approve the FanPass for the marketplace, then retry the buyback preview."
                  : "Close this drawer, run the approval step, then reopen the listing preview."
            }
          />
        ) : null}

        <ul>
          {pendingPreview.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
        <ButtonGroup>
          <button
            type="button"
            className="ghost"
            onClick={() => setPendingPreview(null)}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void confirmPendingPreview()}
            disabled={!canConfirm}
          >
            {canConfirm
              ? t("confirmAndSign")
              : locale === "fr"
                ? "Resoudre les blocages d'abord"
                : "Resolve blockers first"}
          </button>
        </ButtonGroup>
      </Panel>
    </div>
  );
}
