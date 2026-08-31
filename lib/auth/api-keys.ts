import { randomBytes, createHash } from "crypto";

/**
 * API-key generation/hashing — deliberately a fast SHA-256 digest, not
 * bcrypt (lib/auth/password.ts). Passwords are low-entropy human input and
 * need a deliberately slow hash to resist offline guessing; a generated
 * API key is 32 bytes of real randomness, already effectively unguessable,
 * and gets checked on every single API request — bcrypt's cost there would
 * be pure latency with no security benefit.
 */

const KEY_PREFIX_ENV = {
  live: "chama_live_",
  test: "chama_test_",
} as const;

export type ApiKeyEnv = keyof typeof KEY_PREFIX_ENV;

export type GeneratedApiKey = {
  /** Shown to the caller exactly once — never stored, never logged. */
  plaintext: string;
  /** Stored in api_keys.key_hash. */
  hash: string;
  /** Stored in api_keys.key_prefix — enough to recognize the key in a list without it being useful for auth. */
  prefix: string;
};

export function generateApiKey(env: ApiKeyEnv = "live"): GeneratedApiKey {
  const random = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX_ENV[env]}${random}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, 16),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Extracts a Bearer token from an Authorization header, or null if the header is missing/malformed. */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
