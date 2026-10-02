import { AlertTriangle, Check, CircleDashed, ExternalLink, GitMerge, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Attestation, BioStatus, ClaimStatus, PrStatus } from "../lib/types";
import { profileUrl, pullRequestUrl, splitClaimKey } from "../lib/github";
import { formatIsoTimestamp } from "../lib/format";

// ---------------------------------------------------------------------------
// Status chip
// ---------------------------------------------------------------------------

const chipStyles: Record<ClaimStatus, string> = {
  VERIFIED: "border-jade-500/50 bg-jade-500/10 text-jade-400",
  REJECTED: "border-ember-500/50 bg-ember-500/10 text-ember-400",
  PENDING: "border-amber-500/50 bg-amber-500/10 text-amber-300",
};

const chipLabels: Record<ClaimStatus, string> = {
  VERIFIED: "Verified",
  REJECTED: "Not verified",
  PENDING: "Waiting for a check",
};

export function StatusChip({ status }: { status: ClaimStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${chipStyles[status]}`}>
      {chipLabels[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// One of the two checks the validators run
// ---------------------------------------------------------------------------

type CheckState = "pass" | "fail" | "unavailable" | "idle";

function CheckLine({ state, title, detail }: { state: CheckState; title: string; detail?: ReactNode }) {
  const icon =
    state === "pass" ? (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-jade-500/15 text-jade-400">
        <Check className="h-3.5 w-3.5" aria-hidden />
      </span>
    ) : state === "fail" ? (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ember-500/15 text-ember-400">
        <X className="h-3.5 w-3.5" aria-hidden />
      </span>
    ) : state === "unavailable" ? (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      </span>
    ) : (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-deep-800 text-mist-500">
        <CircleDashed className="h-3.5 w-3.5" aria-hidden />
      </span>
    );
  const sr = state === "pass" ? "Passed" : state === "fail" ? "Failed" : state === "unavailable" ? "Could not check" : "Not checked yet";
  return (
    <li className="flex items-start gap-3 py-3">
      {icon}
      <div className="min-w-0">
        <p className="text-[14px] text-mist-100">
          <span className="sr-only">{sr}: </span>
          {title}
        </p>
        {detail && <p className="mt-0.5 text-[12.5px] leading-relaxed text-mist-400">{detail}</p>}
      </div>
    </li>
  );
}

function prCheck(status: PrStatus, username: string): { state: CheckState; title: string; detail?: string } {
  switch (status) {
    case "MERGED_BY_AUTHOR":
      return { state: "pass", title: `Pull request was merged, and @${username} wrote it` };
    case "NOT_MERGED_OR_WRONG_AUTHOR":
      return {
        state: "fail",
        title: `Pull request isn't merged, or wasn't written by @${username}`,
        detail: "Check the repository link, the number and the username. Only merged pull requests you authored count.",
      };
    case "FETCH_UNAVAILABLE":
      return { state: "unavailable", title: "GitHub couldn't be reached for this check", detail: "This is usually a rate limit. Try again after the cooldown." };
    default:
      return { state: "idle", title: "Pull request not checked yet" };
  }
}

function bioCheck(status: BioStatus, username: string): { state: CheckState; title: string; detail?: string } {
  switch (status) {
    case "ADDRESS_FOUND":
      return { state: "pass", title: `Wallet address found in the GitHub bio of @${username}` };
    case "ADDRESS_NOT_FOUND":
      return {
        state: "fail",
        title: `Wallet address isn't in the GitHub bio of @${username}`,
        detail: "Paste the proof string into your GitHub bio, save it, then check again.",
      };
    case "FETCH_UNAVAILABLE":
      return { state: "unavailable", title: "GitHub couldn't be reached for this check", detail: "This is usually a rate limit. Try again after the cooldown." };
    default:
      return { state: "idle", title: "GitHub bio not checked yet" };
  }
}

// ---------------------------------------------------------------------------
// The receipt: one claim, both checks, the outcome
// ---------------------------------------------------------------------------

export function ClaimReceipt({ attestation, footer }: { attestation: Attestation; footer?: ReactNode }) {
  const parts = splitClaimKey(attestation.claim_key);
  const pr = prCheck(attestation.pr_status, attestation.github_username);
  const bio = bioCheck(attestation.bio_status, attestation.github_username);
  const verified = attestation.status === "VERIFIED";

  return (
    <article className="rise-in overflow-hidden rounded-lg border border-deep-700 bg-deep-900/80 shadow-sheet">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <a
            href={pullRequestUrl(attestation.claim_key)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex max-w-full items-center gap-2 font-mono text-[15px] text-mist-100 hover:text-beacon-300"
          >
            <GitMerge className={`h-4 w-4 shrink-0 ${verified ? "text-beacon-400" : "text-mist-500"}`} aria-hidden />
            <span className="break-all">
              {parts ? (
                <>
                  {parts.owner}/{parts.repo}
                  <span className="text-beacon-300"> #{parts.pr}</span>
                </>
              ) : (
                attestation.claim_key
              )}
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-mist-500" aria-hidden />
          </a>
          <p className="mt-1.5 text-[12.5px] text-mist-400">
            Claimed as{" "}
            <a href={profileUrl(attestation.github_username)} target="_blank" rel="noreferrer noopener" className="text-mist-200 underline decoration-deep-600 underline-offset-2 hover:text-beacon-300">
              @{attestation.github_username}
            </a>
          </p>
        </div>
        <StatusChip status={attestation.status} />
      </header>

      <ul className="divide-y divide-deep-800 border-t border-dashed border-deep-600 px-5">
        <CheckLine {...pr} />
        <CheckLine {...bio} />
      </ul>

      <div className="space-y-2 border-t border-dashed border-deep-600 px-5 py-4 text-[12.5px] text-mist-400">
        {attestation.rationale && (
          <p>
            <span className="text-mist-500">Validators noted: </span>
            {attestation.rationale}
          </p>
        )}
        {attestation.note && (
          <p>
            <span className="text-mist-500">Your note: </span>
            {attestation.note}
          </p>
        )}
        <p className="font-mono text-[12px] text-mist-500">
          {attestation.attempts === 0
            ? "No check has run yet"
            : `${attestation.attempts} ${attestation.attempts === 1 ? "check" : "checks"}, last on ${formatIsoTimestamp(attestation.last_checked_at)}`}
          {verified && attestation.merged_at ? `, merged ${formatIsoTimestamp(attestation.merged_at)}` : ""}
        </p>
      </div>

      {footer && <div className="border-t border-deep-700 bg-deep-850/60 px-5 py-4">{footer}</div>}
    </article>
  );
}
