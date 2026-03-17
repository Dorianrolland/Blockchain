import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { Wallet, keccak256, toUtf8Bytes, type Provider } from "ethers";

export const EMBEDDED_WALLET_PROVIDER_ID = "embedded-beta";
export const EMBEDDED_WALLET_PROVIDER_LABEL = "Embedded Wallet Beta";

export const SPONSORED_ACTIONS = [
  "mint_standard",
  "mint_fanpass",
  "claim_insurance",
  "redeem_perk",
  "redeem_merch",
] as const;

export type SponsoredAction =
  | "mint_standard"
  | "mint_fanpass"
  | "claim_insurance"
  | "redeem_perk"
  | "redeem_merch";

export interface EmbeddedWalletSessionClaims {
  sessionId: string;
  email: string;
  walletAddress: string;
  expiresAt: number;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4 || 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function signValue(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function deriveEmbeddedWallet(
  masterKey: string,
  email: string,
  provider?: Provider,
): Wallet {
  const normalizedEmail = normalizeEmail(email);
  const derivedPrivateKey = keccak256(toUtf8Bytes(`${masterKey}:${normalizedEmail}`));
  return new Wallet(derivedPrivateKey, provider);
}

export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashVerificationCode(secret: string, email: string, code: string): string {
  return createHash("sha256")
    .update(`${secret}:${normalizeEmail(email)}:${code}`)
    .digest("hex");
}

export function codesMatch(expectedHash: string, secret: string, email: string, code: string): boolean {
  const actualHash = hashVerificationCode(secret, email, code);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}

export function createSessionClaims(input: {
  email: string;
  walletAddress: string;
  expiresAt: number;
}): EmbeddedWalletSessionClaims {
  return {
    sessionId: randomUUID(),
    email: normalizeEmail(input.email),
    walletAddress: input.walletAddress,
    expiresAt: input.expiresAt,
  };
}

export function signSessionToken(
  claims: EmbeddedWalletSessionClaims,
  sessionSecret: string,
): string {
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = signValue(payload, sessionSecret);
  return `${payload}.${signature}`;
}

export function verifySessionToken(
  token: string,
  sessionSecret: string,
): EmbeddedWalletSessionClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signValue(payload, sessionSecret);
  const expected = Buffer.from(expectedSignature, "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as EmbeddedWalletSessionClaims;
    if (
      !parsed ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.walletAddress !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      email: normalizeEmail(parsed.email),
      walletAddress: parsed.walletAddress,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}
