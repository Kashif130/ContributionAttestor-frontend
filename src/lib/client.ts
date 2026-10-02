import { createClient, createAccount } from "genlayer-js";
import { TransactionStatus, ExecutionResult } from "genlayer-js/types";
import { activeChain, CONTRACT_ADDRESS } from "./networks";
import type { Attestation, BlacklistStatus, LeaderboardRow, Signer, VerifiedClaim } from "./types";
import { withActiveProvider } from "./injectedWallets";
import { ensureWalletOnActiveNetwork } from "./evm";

// A read-only client needs no signer at all: every view method is a free call with no wallet
// interaction, so anyone can look up a reputation before any wallet exists.
const readClient = createClient({ chain: activeChain });

/**
 * Builds a write-capable client bound to a specific signer for exactly one transaction.
 * `signer` is either a raw private key (burner wallet) or an already-connected injected
 * address string (MetaMask etc, per genlayer-js's own account-as-address pattern).
 */
function writeClientFor(signer: `0x${string}`, isPrivateKey: boolean) {
  const account: unknown = isPrivateKey ? createAccount(signer) : signer;
  return createClient({ chain: activeChain, account } as Parameters<typeof createClient>[0]);
}

export type { Signer };

/** Native-token balance for a wallet address (for a "have I got gas" hint in the UI). */
export async function readClientBalance(address: `0x${string}`): Promise<bigint> {
  const client = readClient as unknown as {
    getBalance: (args: { address: `0x${string}` }) => Promise<bigint>;
  };
  return client.getBalance({ address });
}

/**
 * genlayer-js can hand back decoded contract dicts as `Map`s and integers as `bigint`s. The UI
 * wants plain objects and numbers, so normalise once here: Map -> object, bigint -> number when
 * it is safe (otherwise a decimal string, which is what wei fields already are).
 */
function normalize(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => {
      obj[String(k)] = normalize(v);
    });
    return obj;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= -BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) obj[k] = normalize(v);
    return obj;
  }
  return value;
}

async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const raw = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: "accepted",
  });
  return normalize(raw) as T;
}

/** Shape of the fields we care about on a transaction receipt -- kept loose/`unknown`-cast at
 * the call site since we don't depend on genlayer-js's exact receipt type surface. */
interface ReceiptExecutionInfo {
  txExecutionResultName?: string;
  stderr?: string;
  result?: { stderr?: string };
  data?: { stderr?: string };
}

/** `verify_contribution` runs a consensus round (validators call GitHub's API and run the
 * model), which takes far longer than a plain state change. */
const RETRIES_PLAIN = 60;
const RETRIES_CONSENSUS = 160;
const POLL_INTERVAL_MS = 3000;

async function write(
  signer: Signer,
  functionName: string,
  args: unknown[],
  opts: { valueWei?: bigint; consensus?: boolean } = {},
): Promise<string> {
  const isPrivateKey = !!signer.privateKey;

  // Auto network switch: a browser wallet must be on the GenLayer network to sign for it. If it
  // isn't, this triggers the wallet's own "switch network" / "add network" popup first.
  if (!isPrivateKey && signer.provider) {
    await ensureWalletOnActiveNetwork(signer.provider);
  }

  const client = writeClientFor(signer.privateKey ?? signer.address, isPrivateKey);
  // For an injected wallet, make sure the wallet the user actually picked is the one that signs
  // (matters when several extensions are installed). No-op for the burner wallet.
  const hash = await withActiveProvider(isPrivateKey ? null : (signer.provider ?? null), () =>
    client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args,
      value: opts.valueWei ?? 0n,
    }),
  );
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: opts.consensus ? RETRIES_CONSENSUS : RETRIES_PLAIN,
    interval: POLL_INTERVAL_MS,
    fullTransaction: true,
  });

  // Consensus reaching ACCEPTED only means validators agreed on an outcome -- that outcome can
  // itself be a failed execution (a contract-side validation error, for instance). Treating
  // ACCEPTED alone as success would show a false "success" toast while nothing was written.
  const r = receipt as unknown as ReceiptExecutionInfo;
  if (r.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
    const detail = r.stderr || r.result?.stderr || r.data?.stderr;
    throw new Error(
      detail
        ? `The contract rejected this transaction: ${cleanContractError(detail)}`
        : "The contract rejected this transaction (execution failed). Double-check your inputs.",
    );
  }
  if (r.txExecutionResultName === ExecutionResult.NOT_VOTED) {
    throw new Error(
      "The network hasn't finished voting on this transaction yet. Wait a moment and check whether it went through before retrying.",
    );
  }
  return hash;
}

/** The contract prefixes its user-facing errors with [EXPECTED] / [TRANSIENT] / [LLM_ERROR]. */
function cleanContractError(detail: string): string {
  const match = detail.match(/\[(EXPECTED|TRANSIENT|LLM_ERROR)\]\s*([^\n]*)/);
  if (!match) return detail;
  const [, kind, message] = match;
  if (kind === "TRANSIENT") return `${message} (temporary — try again in a moment)`;
  if (kind === "LLM_ERROR") return `${message} (the consensus model call failed — try again)`;
  return message;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const getRewardPool = () => read<string>("get_reward_pool");
export const getReputation = (address: string) => read<number>("get_reputation", [address]);
export const getBlacklistStatus = (address: string) => read<BlacklistStatus>("get_blacklist_status", [address]);
export const getExpectedBioProof = (address: string) => read<string>("get_expected_bio_proof", [address]);
export const listClaimsForAddress = (address: string) => read<VerifiedClaim[]>("list_claims_for_address", [address]);
export const listVerifiedAddresses = (offset: number, limit: number) =>
  read<LeaderboardRow[]>("list_verified_addresses", [offset, limit]);
export const getVerifiedOwner = (repoUrl: string, pr: number) => read<string>("get_verified_owner", [repoUrl, pr]);

/** Returns null when no claim is registered (the contract answers with an empty dict). */
export async function getAttestation(repoUrl: string, pr: number, address: string): Promise<Attestation | null> {
  const a = await read<Partial<Attestation>>("get_attestation", [repoUrl, pr, address]);
  return a && a.claim_key ? (a as Attestation) : null;
}

/** Every verified address, highest reputation first. Capped so a huge registry can't hang the UI. */
export async function listLeaderboard(cap = 500, pageSize = 100): Promise<LeaderboardRow[]> {
  const out: LeaderboardRow[] = [];
  for (let offset = 0; offset < cap; offset += pageSize) {
    const page = await listVerifiedAddresses(offset, pageSize);
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out.sort((a, b) => b.reputation - a.reputation);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Self-sovereign: records which GitHub username this wallet claims. Free to repeat until verified. */
export const registerClaim = (signer: Signer, githubUsername: string, repoUrl: string, pr: number, note: string) =>
  write(signer, "register_claim", [githubUsername, repoUrl, pr, note]);

/** Runs the consensus round. Anyone may trigger it; it only ever re-checks the claimant's own username. */
export const verifyContribution = (signer: Signer, claimant: string, repoUrl: string, pr: number) =>
  write(signer, "verify_contribution", [claimant, repoUrl, pr], { consensus: true });

export const fundRewards = (signer: Signer, valueWei: bigint) => write(signer, "fund_rewards", [], { valueWei });

export const blacklistAddress = (signer: Signer, target: string, reason: string) =>
  write(signer, "blacklist_address", [target, reason]);

export const unblacklistAddress = (signer: Signer, target: string) => write(signer, "unblacklist_address", [target]);
