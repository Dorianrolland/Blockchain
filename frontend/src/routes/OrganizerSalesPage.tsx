import { useState } from "react";

import {
  Badge,
  ButtonGroup,
  Card,
  EmptyState,
  InfoList,
  PageHeader,
  Panel,
  SectionHeader,
  Tag,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { formatPol } from "../lib/format";
import { useAppState } from "../state/useAppState";

function percentageDelta(primaryPrice: bigint | null, resalePrice: bigint | null): string {
  if (!primaryPrice || !resalePrice || primaryPrice === 0n) {
    return "-";
  }

  const deltaBasisPoints = ((resalePrice - primaryPrice) * 10_000n) / primaryPrice;
  const sign = deltaBasisPoints > 0n ? "+" : "";
  const whole = Number(deltaBasisPoints) / 100;
  return `${sign}${whole.toFixed(1)}%`;
}

export function OrganizerSalesPage() {
  const { locale } = useI18n();
  const {
    listings,
    marketStats,
    systemState,
    indexedReadsAvailable,
    availableEvents,
    selectedEventId,
    walletAddress,
    connectWallet,
    preparePreview,
    userRoles,
    setErrorMessage,
  } = useAppState();
  const [buybackTokenIdInput, setBuybackTokenIdInput] = useState("");

  const copy =
    locale === "fr"
      ? {
          title: "Ventes & revente",
          subtitle: "Vue read-only des signaux de marche et de la discipline de prix autour de l'evenement selectionne.",
          listingTitle: "Annonces actives",
          listingSubtitle: "Le cockpit ops garde la lecture des volumes et de la discipline secondaire dans un espace dedie.",
          emptyTitle: "Aucune annonce indexee pour le moment",
          emptyDescription: "Cette surface devient utile des que les annonces et les stats marche sont indexees.",
          indexed: "Indexe",
          fallback: "Fallback",
          primaryPrice: "Prix primaire",
          floor: "Floor",
          median: "Mediane",
          avgVsPrimary: "Moyenne vs primaire",
          seller: "Vendeur",
          price: "Prix",
          vsPrimary: "Vs primaire",
          health: "Sante",
          watch: "A surveiller",
          healthy: "Sain",
          listingCount: "Nombre d'annonces",
          suggestedPrice: "Prix suggere",
          maxPrice: "Prix visible max",
          buybackTitle: "Buyback FanPass",
          buybackSubtitle:
            "Reprenez un FanPass au prix primaire depuis le cockpit ops, avec preview et controle d'approbation.",
          buybackPrice: "Prix de buyback",
          buybackScope: "Scope",
          buybackRole: "Role",
          buybackToken: "Token FanPass",
          buybackAction: "Lancer le buyback",
          buybackConnect: "Connecter le wallet",
          buybackScopeValue: "FanPass uniquement",
          buybackRoleOk: "BUYBACK_ROLE actif",
          buybackRoleMissing: "BUYBACK_ROLE manquant",
          buybackTokenPlaceholder: "Ex: 42",
          buybackInvalidToken: "Entrez un token id numerique valide.",
        }
      : {
          title: "Sales & resale",
          subtitle: "Read-only view of market signals and pricing discipline around the selected event.",
          listingTitle: "Active listings",
          listingSubtitle: "The ops cockpit keeps volume and secondary discipline in a dedicated surface.",
          emptyTitle: "No indexed listings yet",
          emptyDescription: "This surface becomes useful as soon as listings and market stats are indexed.",
          indexed: "Indexed",
          fallback: "Fallback",
          primaryPrice: "Primary price",
          floor: "Floor",
          median: "Median",
          avgVsPrimary: "Avg vs primary",
          seller: "Seller",
          price: "Price",
          vsPrimary: "Vs primary",
          health: "Health",
          watch: "Watch",
          healthy: "Healthy",
          listingCount: "Listing count",
          suggestedPrice: "Suggested list price",
          maxPrice: "Highest visible price",
          buybackTitle: "FanPass buyback",
          buybackSubtitle:
            "Take back a FanPass at primary price from the ops cockpit with preview and approval checks.",
          buybackPrice: "Buyback price",
          buybackScope: "Scope",
          buybackRole: "Role",
          buybackToken: "FanPass token",
          buybackAction: "Run buyback",
          buybackConnect: "Connect wallet",
          buybackScopeValue: "FanPass only",
          buybackRoleOk: "BUYBACK_ROLE active",
          buybackRoleMissing: "BUYBACK_ROLE missing",
          buybackTokenPlaceholder: "Example: 42",
          buybackInvalidToken: "Enter a valid numeric token id.",
        };

  const primaryPrice = systemState?.primaryPrice ?? null;
  const selectedEvent =
    availableEvents.find((event) => event.ticketEventId === selectedEventId) ?? null;
  const canRunBuyback =
    (selectedEvent?.version ?? "v1") === "v2" && (userRoles.isAdmin || userRoles.isBuybackOperator);

  const runBuyback = async () => {
    if (!walletAddress) {
      await connectWallet();
      return;
    }
    if (!canRunBuyback) {
      setErrorMessage(
        locale === "fr"
          ? "Le wallet courant n'a pas le role BUYBACK_ROLE."
          : "The current wallet does not have BUYBACK_ROLE.",
      );
      return;
    }
    if (!/^\d+$/.test(buybackTokenIdInput.trim())) {
      setErrorMessage(copy.buybackInvalidToken);
      return;
    }

    const tokenId = BigInt(buybackTokenIdInput.trim());
    await preparePreview({
      label: copy.buybackTitle,
      description: copy.buybackSubtitle,
      action: { type: "organizer_buyback", tokenId },
      details: [
        locale === "fr"
          ? "Verifie le role buyback, la classe FanPass, l'etat d'usage et l'approbation marketplace."
          : "Checks buyback role, FanPass class, usage state, and marketplace approval.",
        primaryPrice
          ? `${copy.buybackPrice}: ${formatPol(primaryPrice)} POL`
          : copy.buybackPrice,
        locale === "fr"
          ? "Le paiement repart vers le vendeur et le ticket revient au stock organisateur."
          : "Payment goes back to the seller and the ticket returns to organizer inventory.",
      ],
      run: async (client) => {
        if (!client.organizerBuyback) {
          throw new Error("Organizer buyback is unavailable in the current client.");
        }
        return client.organizerBuyback(tokenId);
      },
    });
  };

  return (
    <div className="route-stack organizer-sales-route" data-testid="organizer-sales-page">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        workspace="organizer"
        context={
          <div className="inline-actions">
            <Tag tone={indexedReadsAvailable ? "success" : "warning"}>
              {indexedReadsAvailable ? copy.indexed : copy.fallback}
            </Tag>
            <Tag tone="info">{listings.length} listing(s)</Tag>
          </div>
        }
      />

      <section className="ops-metric-grid">
        <Card className="ops-metric-card" surface="accent">
          <span>{copy.primaryPrice}</span>
          <strong>{primaryPrice ? `${formatPol(primaryPrice)} POL` : "-"}</strong>
        </Card>
        <Card className="ops-metric-card" surface="glass">
          <span>{copy.floor}</span>
          <strong>
            {marketStats?.floorPrice !== null && marketStats?.floorPrice !== undefined
              ? `${formatPol(marketStats.floorPrice)} POL`
              : "-"}
          </strong>
        </Card>
        <Card className="ops-metric-card" surface="glass">
          <span>{copy.median}</span>
          <strong>
            {marketStats?.medianPrice !== null && marketStats?.medianPrice !== undefined
              ? `${formatPol(marketStats.medianPrice)} POL`
              : "-"}
          </strong>
        </Card>
        <Card className="ops-metric-card" surface="glass">
          <span>{copy.avgVsPrimary}</span>
          <strong>{percentageDelta(primaryPrice, marketStats?.averagePrice ?? null)}</strong>
        </Card>
      </section>

      {selectedEvent?.version === "v2" ? (
        <Panel className="ops-sales-panel" surface="glass">
          <SectionHeader title={copy.buybackTitle} subtitle={copy.buybackSubtitle} />
          <div className="organizer-cockpit-grid">
            <Card className="organizer-panel-card" surface="accent">
              <label>
                {copy.buybackToken}
                <input
                  value={buybackTokenIdInput}
                  onChange={(event) => setBuybackTokenIdInput(event.target.value)}
                  placeholder={copy.buybackTokenPlaceholder}
                  inputMode="numeric"
                />
              </label>
              <ButtonGroup>
                {walletAddress ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void runBuyback()}
                    disabled={!canRunBuyback}
                  >
                    {copy.buybackAction}
                  </button>
                ) : (
                  <button type="button" className="primary" onClick={() => void connectWallet()}>
                    {copy.buybackConnect}
                  </button>
                )}
              </ButtonGroup>
              <InfoList
                entries={[
                  {
                    label: copy.buybackPrice,
                    value: primaryPrice ? `${formatPol(primaryPrice)} POL` : "-",
                  },
                  {
                    label: copy.buybackScope,
                    value: copy.buybackScopeValue,
                  },
                  {
                    label: copy.buybackRole,
                    value: canRunBuyback ? copy.buybackRoleOk : copy.buybackRoleMissing,
                  },
                ]}
              />
            </Card>
          </div>
        </Panel>
      ) : null}

      <Panel className="ops-sales-panel" surface="glass">
        <SectionHeader title={copy.listingTitle} subtitle={copy.listingSubtitle} />
        {!indexedReadsAvailable && listings.length === 0 ? (
          <EmptyState title={copy.emptyTitle} description={copy.emptyDescription} />
        ) : null}

        {listings.length > 0 ? (
          <table className="market-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>{copy.seller}</th>
                <th>{copy.price}</th>
                <th>{copy.vsPrimary}</th>
                <th>{copy.health}</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.tokenId.toString()}>
                  <td>#{listing.tokenId.toString()}</td>
                  <td>{listing.seller}</td>
                  <td>{formatPol(listing.price)} POL</td>
                  <td>{percentageDelta(primaryPrice, listing.price)}</td>
                  <td>
                    <Badge tone={primaryPrice && listing.price > primaryPrice ? "warning" : "success"}>
                      {primaryPrice && listing.price > primaryPrice ? copy.watch : copy.healthy}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Panel>

      <Panel surface="glass">
        <InfoList
          entries={[
            {
              label: copy.listingCount,
              value: marketStats?.listingCount ?? listings.length,
            },
            {
              label: copy.suggestedPrice,
              value:
                marketStats?.suggestedListPrice !== null && marketStats?.suggestedListPrice !== undefined
                  ? `${formatPol(marketStats.suggestedListPrice)} POL`
                  : "-",
            },
            {
              label: copy.maxPrice,
              value:
                marketStats?.maxPrice !== null && marketStats?.maxPrice !== undefined
                  ? `${formatPol(marketStats.maxPrice)} POL`
                  : "-",
            },
          ]}
        />
      </Panel>
    </div>
  );
}
