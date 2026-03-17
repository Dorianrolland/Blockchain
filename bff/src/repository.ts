import { pool } from "./db.js";
import type {
  DemoCatalogEntry,
  DemoLineupStatus,
  OperationalActivity,
  OperationalRoleAssignment,
  TicketEventDeployment,
} from "./types.js";

export type ListingSort = "price_asc" | "price_desc" | "recent";

interface ListingRow {
  ticket_event_id: string;
  token_id: string;
  seller: string;
  price_wei: string;
  is_active: boolean;
  updated_block: string;
}

interface TicketRow {
  ticket_event_id: string;
  token_id: string;
  owner: string;
  used: boolean;
  token_uri: string;
  listed: boolean;
  listing_price_wei: string | null;
}

interface TimelineRow {
  chain_event_id: string;
  ticket_event_id: string;
  event_type: string;
  token_id: string | null;
  block_number: string;
  tx_hash: string;
  block_timestamp: string | null;
  actor_from: string | null;
  actor_to: string | null;
  seller: string | null;
  buyer: string | null;
  scanner: string | null;
  price_wei: string | null;
  fee_amount_wei: string | null;
  collectible_enabled: boolean | null;
}

interface RoleAssignmentRow {
  ticket_event_id: string;
  contract_scope: "ticket" | "checkin_registry";
  role_id: string;
  account: string;
  granted_by: string | null;
  is_active: boolean;
  updated_block: string;
  updated_tx_hash: string;
}

interface OpsActivityRow {
  activity_id: string;
  ticket_event_id: string;
  contract_scope: "ticket" | "checkin_registry";
  activity_type: "paused" | "unpaused" | "role_granted" | "role_revoked";
  role_id: string | null;
  account: string | null;
  actor: string | null;
  block_number: string;
  log_index: number;
  tx_hash: string;
  block_timestamp: string | null;
}

interface DemoCatalogRow {
  lineup_status: DemoLineupStatus;
  slot_index: number;
  ticket_event_id: string;
  source: "ticketmaster";
  source_event_id: string;
  name: string;
  starts_at: string | null;
  venue_name: string | null;
  city: string | null;
  country_code: string | null;
  image_url: string | null;
  category: string | null;
  source_url: string | null;
  fetched_at: string;
  expires_at: string;
  demo_disclaimer: string;
}

interface FanTicketProfileStatsRow {
  current_ticket_count: string;
  listed_ticket_count: string;
}

interface EmbeddedWalletChallengeRow {
  email: string;
  code_hash: string;
  wallet_address: string;
  expires_at: string;
  consumed_at: string | null;
}

interface EmbeddedWalletSessionRow {
  session_id: string;
  email: string;
  wallet_address: string;
  issued_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface EmbeddedWalletChallengeRecord {
  email: string;
  codeHash: string;
  walletAddress: string;
  expiresAt: number;
  consumedAt: number | null;
}

export interface EmbeddedWalletSessionRecord {
  sessionId: string;
  email: string;
  walletAddress: string;
  issuedAt: number;
  expiresAt: number;
  revokedAt: number | null;
  lastUsedAt: number | null;
}

export async function getIndexedBlock(): Promise<number> {
  const result = await pool.query<{ value: string }>(
    "SELECT value FROM chain_state WHERE key = 'last_indexed_block'",
  );

  const raw = result.rows[0]?.value;
  if (!raw) {
    return 0;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getLatestProcessedBlockHash(
  blockNumber: number,
): Promise<string | null> {
  const result = await pool.query<{ block_hash: string }>(
    "SELECT block_hash FROM processed_blocks WHERE block_number = $1",
    [blockNumber],
  );

  return result.rows[0]?.block_hash ?? null;
}

export async function getActiveListings(params: {
  ticketEventId: string;
  sort: ListingSort;
  limit: number;
  offset: number;
}): Promise<{ items: ListingRow[]; total: number }> {
  const orderBy =
    params.sort === "price_asc"
      ? "price_wei::numeric ASC, updated_block DESC"
      : params.sort === "price_desc"
        ? "price_wei::numeric DESC, updated_block DESC"
        : "updated_block DESC, token_id::numeric DESC";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<ListingRow>(
      `
        SELECT ticket_event_id, token_id, seller, price_wei, is_active, updated_block
        FROM listing_state_items
        WHERE ticket_event_id = $3 AND is_active = TRUE
        ORDER BY ${orderBy}
        LIMIT $1 OFFSET $2
      `,
      [params.limit, params.offset, params.ticketEventId],
    ),
    pool.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM listing_state_items
        WHERE ticket_event_id = $1 AND is_active = TRUE
      `,
      [params.ticketEventId],
    ),
  ]);

  return {
    items: itemsResult.rows,
    total: Number(totalResult.rows[0]?.count ?? "0"),
  };
}

function median(values: bigint[]): bigint | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2n;
}

export async function getMarketStats(ticketEventId: string): Promise<{
  listingCount: number;
  floorPriceWei: string | null;
  medianPriceWei: string | null;
  maxPriceWei: string | null;
  averagePriceWei: string | null;
  suggestedListPriceWei: string | null;
}> {
  const result = await pool.query<{ price_wei: string }>(
    `
      SELECT price_wei
      FROM listing_state_items
      WHERE ticket_event_id = $1 AND is_active = TRUE
    `,
    [ticketEventId],
  );

  if (!result.rows.length) {
    return {
      listingCount: 0,
      floorPriceWei: null,
      medianPriceWei: null,
      maxPriceWei: null,
      averagePriceWei: null,
      suggestedListPriceWei: null,
    };
  }

  const prices = result.rows.map((row) => BigInt(row.price_wei));
  const sorted = [...prices].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const total = prices.reduce((acc, price) => acc + price, 0n);
  const floor = sorted[0] ?? null;
  const max = sorted[sorted.length - 1] ?? null;
  const med = median(sorted);
  const avg = total / BigInt(prices.length);

  return {
    listingCount: prices.length,
    floorPriceWei: floor?.toString() ?? null,
    medianPriceWei: med?.toString() ?? null,
    maxPriceWei: max?.toString() ?? null,
    averagePriceWei: avg.toString(),
    suggestedListPriceWei: med?.toString() ?? floor?.toString() ?? null,
  };
}

export async function getTicketsByOwner(
  address: string,
  ticketEventId: string,
): Promise<TicketRow[]> {
  const result = await pool.query<TicketRow>(
    `
      SELECT ticket_event_id, token_id, owner, used, token_uri, listed, listing_price_wei
      FROM ticket_state_items
      WHERE ticket_event_id = $1 AND LOWER(owner) = LOWER($2)
      ORDER BY token_id::numeric ASC
    `,
    [ticketEventId, address],
  );

  return result.rows;
}

export async function getTicketTimeline(
  tokenId: string,
  ticketEventId: string,
): Promise<TimelineRow[]> {
  const result = await pool.query<TimelineRow>(
    `
      SELECT
        chain_event_id,
        ticket_event_id,
        event_type,
        token_id,
        block_number,
        tx_hash,
        block_timestamp,
        actor_from,
        actor_to,
        seller,
        buyer,
        scanner,
        price_wei,
        fee_amount_wei,
        collectible_enabled
      FROM indexed_event_log
      WHERE
        ticket_event_id = $1
        AND (
          token_id = $2
          OR (token_id IS NULL AND event_type = 'collectible_mode')
        )
      ORDER BY block_number DESC, log_index DESC
      LIMIT 400
    `,
    [ticketEventId, tokenId],
  );

  return result.rows;
}

export async function getEventDeployments(): Promise<TicketEventDeployment[]> {
  const result = await pool.query<{
    ticket_event_id: string;
    name: string;
    symbol: string;
    version: string | null;
    artist_id: string | null;
    series_id: string | null;
    primary_price_wei: string;
    max_supply: string;
    fan_pass_allocation_bps: string | null;
    artist_royalty_bps: string | null;
    treasury: string;
    admin: string;
    ticket_nft_address: string;
    marketplace_address: string;
    checkin_registry_address: string;
    collectible_contract: string | null;
    fan_score_registry: string | null;
    fan_fuel_bank: string | null;
    insurance_pool: string | null;
    oracle_adapter: string | null;
    merch_store: string | null;
    perk_manager: string | null;
    deployment_block: string;
    registered_at: string;
  }>(
    `
      SELECT
        ticket_event_id,
        name,
        symbol,
        version,
        artist_id,
        series_id,
        primary_price_wei,
        max_supply,
        fan_pass_allocation_bps,
        artist_royalty_bps,
        treasury,
        admin,
        ticket_nft_address,
        marketplace_address,
        checkin_registry_address,
        collectible_contract,
        fan_score_registry,
        fan_fuel_bank,
        insurance_pool,
        oracle_adapter,
        merch_store,
        perk_manager,
        deployment_block,
        registered_at
      FROM event_deployments
      ORDER BY deployment_block ASC, ticket_event_id ASC
    `,
  );

  return result.rows.map((row) => ({
    ticketEventId: row.ticket_event_id,
    name: row.name,
    symbol: row.symbol,
    version: row.version === "v2" ? "v2" : "v1",
    artistId: row.artist_id ?? undefined,
    seriesId: row.series_id ?? undefined,
    primaryPriceWei: row.primary_price_wei,
    maxSupply: row.max_supply,
    fanPassAllocationBps: row.fan_pass_allocation_bps ?? undefined,
    artistRoyaltyBps: row.artist_royalty_bps ?? undefined,
    treasury: row.treasury,
    admin: row.admin,
    ticketNftAddress: row.ticket_nft_address,
    marketplaceAddress: row.marketplace_address,
    checkInRegistryAddress: row.checkin_registry_address,
    collectibleContract: row.collectible_contract ?? undefined,
    fanScoreRegistry: row.fan_score_registry ?? undefined,
    fanFuelBank: row.fan_fuel_bank ?? undefined,
    insurancePool: row.insurance_pool ?? undefined,
    oracleAdapter: row.oracle_adapter ?? undefined,
    merchStore: row.merch_store ?? undefined,
    perkManager: row.perk_manager ?? undefined,
    deploymentBlock: Number(row.deployment_block),
    registeredAt: Number(row.registered_at),
  }));
}

export async function getFanTicketProfileStats(
  address: string,
  ticketEventId: string,
): Promise<{
  currentTicketCount: number;
  listedTicketCount: number;
}> {
  const result = await pool.query<FanTicketProfileStatsRow>(
    `
      SELECT
        COUNT(*)::text AS current_ticket_count,
        COUNT(*) FILTER (WHERE listed = TRUE)::text AS listed_ticket_count
      FROM ticket_state_items
      WHERE ticket_event_id = $1 AND LOWER(owner) = LOWER($2)
    `,
    [ticketEventId, address],
  );

  return {
    currentTicketCount: Number(result.rows[0]?.current_ticket_count ?? "0"),
    listedTicketCount: Number(result.rows[0]?.listed_ticket_count ?? "0"),
  };
}

export async function upsertEmbeddedWalletChallenge(input: {
  email: string;
  codeHash: string;
  walletAddress: string;
  expiresAt: number;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO embedded_wallet_login_challenges (
        email,
        code_hash,
        wallet_address,
        expires_at,
        consumed_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NULL, NOW())
      ON CONFLICT (email) DO UPDATE
      SET code_hash = EXCLUDED.code_hash,
          wallet_address = EXCLUDED.wallet_address,
          expires_at = EXCLUDED.expires_at,
          consumed_at = NULL,
          updated_at = NOW()
    `,
    [input.email, input.codeHash, input.walletAddress, input.expiresAt],
  );
}

export async function getEmbeddedWalletChallenge(
  email: string,
): Promise<EmbeddedWalletChallengeRecord | null> {
  const result = await pool.query<EmbeddedWalletChallengeRow>(
    `
      SELECT email, code_hash, wallet_address, expires_at, consumed_at
      FROM embedded_wallet_login_challenges
      WHERE email = $1
    `,
    [email],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    email: row.email,
    codeHash: row.code_hash,
    walletAddress: row.wallet_address,
    expiresAt: Number(row.expires_at),
    consumedAt: row.consumed_at === null ? null : Number(row.consumed_at),
  };
}

export async function consumeEmbeddedWalletChallenge(
  email: string,
  consumedAt: number,
): Promise<void> {
  await pool.query(
    `
      UPDATE embedded_wallet_login_challenges
      SET consumed_at = $2,
          updated_at = NOW()
      WHERE email = $1
    `,
    [email, consumedAt],
  );
}

export async function createEmbeddedWalletSession(input: {
  sessionId: string;
  email: string;
  walletAddress: string;
  issuedAt: number;
  expiresAt: number;
}): Promise<void> {
  await pool.query(
    `
      INSERT INTO embedded_wallet_sessions (
        session_id,
        email,
        wallet_address,
        issued_at,
        expires_at,
        last_used_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $4, NOW())
    `,
    [input.sessionId, input.email, input.walletAddress, input.issuedAt, input.expiresAt],
  );
}

export async function getEmbeddedWalletSession(
  sessionId: string,
): Promise<EmbeddedWalletSessionRecord | null> {
  const result = await pool.query<EmbeddedWalletSessionRow>(
    `
      SELECT
        session_id,
        email,
        wallet_address,
        issued_at,
        expires_at,
        revoked_at,
        last_used_at
      FROM embedded_wallet_sessions
      WHERE session_id = $1
    `,
    [sessionId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    sessionId: row.session_id,
    email: row.email,
    walletAddress: row.wallet_address,
    issuedAt: Number(row.issued_at),
    expiresAt: Number(row.expires_at),
    revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
    lastUsedAt: row.last_used_at === null ? null : Number(row.last_used_at),
  };
}

export async function touchEmbeddedWalletSession(
  sessionId: string,
  lastUsedAt: number,
): Promise<void> {
  await pool.query(
    `
      UPDATE embedded_wallet_sessions
      SET last_used_at = $2,
          updated_at = NOW()
      WHERE session_id = $1
    `,
    [sessionId, lastUsedAt],
  );
}

export async function getOperationalSummary(ticketEventId: string): Promise<{
  roles: OperationalRoleAssignment[];
  recentActivity: OperationalActivity[];
}> {
  const [rolesResult, activityResult] = await Promise.all([
    pool.query<RoleAssignmentRow>(
      `
        SELECT
          ticket_event_id,
          contract_scope,
          role_id,
          account,
          granted_by,
          is_active,
          updated_block,
          updated_tx_hash
        FROM role_state_items
        WHERE ticket_event_id = $1 AND is_active = TRUE
        ORDER BY contract_scope ASC, role_id ASC, account ASC
      `,
      [ticketEventId],
    ),
    pool.query<OpsActivityRow>(
      `
        SELECT
          activity_id,
          ticket_event_id,
          contract_scope,
          activity_type,
          role_id,
          account,
          actor,
          block_number,
          log_index,
          tx_hash,
          block_timestamp
        FROM ops_activity_log
        WHERE ticket_event_id = $1
        ORDER BY block_number DESC, log_index DESC
        LIMIT 40
      `,
      [ticketEventId],
    ),
  ]);

  return {
    roles: rolesResult.rows.map((row) => ({
      ticketEventId: row.ticket_event_id,
      contractScope: row.contract_scope,
      roleId: row.role_id,
      account: row.account,
      grantedBy: row.granted_by,
      isActive: row.is_active,
      updatedBlock: Number(row.updated_block),
      updatedTxHash: row.updated_tx_hash,
    })),
    recentActivity: activityResult.rows.map((row) => ({
      id: row.activity_id,
      ticketEventId: row.ticket_event_id,
      contractScope: row.contract_scope,
      type: row.activity_type,
      roleId: row.role_id ?? undefined,
      account: row.account ?? undefined,
      actor: row.actor ?? undefined,
      blockNumber: Number(row.block_number),
      logIndex: row.log_index,
      txHash: row.tx_hash,
      timestamp: row.block_timestamp ? Number(row.block_timestamp) : null,
    })),
  };
}

export async function getDemoCatalogEntries(
  lineupStatus: DemoLineupStatus,
): Promise<DemoCatalogEntry[]> {
  const result = await pool.query<DemoCatalogRow>(
    `
      SELECT
        lineup_status,
        slot_index,
        ticket_event_id,
        source,
        source_event_id,
        name,
        starts_at,
        venue_name,
        city,
        country_code,
        image_url,
        category,
        source_url,
        fetched_at,
        expires_at,
        demo_disclaimer
      FROM demo_event_catalog
      WHERE lineup_status = $1
      ORDER BY slot_index ASC
    `,
    [lineupStatus],
  );

  return result.rows.map((row) => ({
    lineupStatus: row.lineup_status,
    slotIndex: row.slot_index,
    ticketEventId: row.ticket_event_id,
    source: row.source,
    sourceEventId: row.source_event_id,
    name: row.name,
    startsAt: row.starts_at === null ? null : Number(row.starts_at),
    venueName: row.venue_name,
    city: row.city,
    countryCode: row.country_code,
    imageUrl: row.image_url,
    category: row.category,
    sourceUrl: row.source_url,
    fetchedAt: Number(row.fetched_at),
    expiresAt: Number(row.expires_at),
    demoDisclaimer: row.demo_disclaimer,
  }));
}
