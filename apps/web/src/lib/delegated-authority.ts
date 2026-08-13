import "server-only";

export {
  buildDelegatedAuthorityMessage,
  canonicalizeDelegatedPolicy,
  delegatedAuthorityStatus,
  DELEGATED_AUTHORITY_MAX_LIFETIME_MS,
  hashDelegatedPolicy,
  parseDelegatedPolicy,
} from "@/lib/delegated-authority-core";

export const DELEGATED_AUTHORITY_CHALLENGE_TTL_MS = 5 * 60 * 1_000;

