export type ClaimStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type PrStatus = "MERGED_BY_AUTHOR" | "NOT_MERGED_OR_WRONG_AUTHOR" | "FETCH_UNAVAILABLE" | "";
export type BioStatus = "ADDRESS_FOUND" | "ADDRESS_NOT_FOUND" | "FETCH_UNAVAILABLE" | "";

/** Mirrors the dict returned by `get_attestation` (an empty object when nothing is registered). */
export interface Attestation {
  claim_key: string; // "owner/repo#123"
  address: string;
  github_username: string;
  note: string;
  status: ClaimStatus;
  pr_status: PrStatus;
  bio_status: BioStatus;
  merged_at: string;
  rationale: string;
  attempts: number;
  registered_at: string;
  last_checked_at: string;
}

/** One row of `list_claims_for_address` (verified claims only). */
export interface VerifiedClaim {
  claim_key: string;
  github_username: string;
  merged_at: string;
  checked_at: string;
}

/** One row of `list_verified_addresses`. */
export interface LeaderboardRow {
  address: string;
  reputation: number;
}

export interface BlacklistStatus {
  blacklisted: boolean;
  reason: string;
}

export type WalletMode = "none" | "burner-locked" | "burner-unlocked" | "injected";

/** A usable signer: an address, optionally paired with the private key that controls it
 *  (present for an unlocked burner wallet, absent for an injected/extension wallet, where
 *  the extension itself holds the key and signs via the browser). */
export interface Signer {
  address: `0x${string}`;
  privateKey?: `0x${string}`;
  /** The EIP-1193 provider of the injected wallet the user picked (absent for the burner). */
  provider?: import("./injectedWallets").Eip1193Provider;
}
