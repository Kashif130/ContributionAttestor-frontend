import { Link } from "react-router-dom";
import { useLeaderboard } from "../hooks/data";
import { buttonClass, Card, SectionTitle } from "../components/ui";
import { ClaimReceipt } from "../components/receipt";
import { AddressSearch } from "./Profile";
import type { Attestation } from "../lib/types";
import { shortAddress } from "../lib/format";

// Clearly labelled illustration of what a finished check looks like. Not real data.
const SAMPLE: Attestation = {
  claim_key: "example-org/example-repo#128",
  address: "0x0000000000000000000000000000000000000000",
  github_username: "octo-dev",
  note: "",
  status: "VERIFIED",
  pr_status: "MERGED_BY_AUTHOR",
  bio_status: "ADDRESS_FOUND",
  merged_at: "2026-09-14T09:30:00Z",
  rationale: "",
  attempts: 1,
  registered_at: "2026-09-14T10:00:00Z",
  last_checked_at: "2026-09-14T10:02:00Z",
};

const STEPS = [
  { title: "Add your address to your GitHub bio", body: "One line of text that shows you control the account. You can remove it after the check." },
  { title: "Register the claim", body: "Tell the contract which username wrote which pull request. Only your own wallet can register for your address." },
  { title: "Run the check", body: "Validators call GitHub's public API and confirm the pull request was merged under your username and your address is in the bio." },
  { title: "Keep the proof", body: "The pull request is locked to your wallet for good, and your verified count goes up by one." },
];

export function Landing() {
  const board = useLeaderboard();
  const top = (board.data ?? []).slice(0, 5);

  return (
    <div className="space-y-20">
      <section className="rise-in grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <h1 className="font-display text-[40px] font-semibold leading-[1.08] text-mist-100 sm:text-[52px]">
            Prove the pull requests you've merged.
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-mist-400">
            Link your wallet to the open-source work you've shipped. GenLayer validators read GitHub directly, so no maintainer has to
            sign off and nobody can claim a pull request that isn't theirs.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/claim" className={buttonClass("primary")}>
              Claim a pull request
            </Link>
            <Link to="/registry" className={buttonClass("secondary")}>
              Browse the registry
            </Link>
          </div>
        </div>

        <Card className="p-5">
          <h2 className="font-display text-[18px] font-semibold text-mist-100">Look up any wallet</h2>
          <p className="mb-4 mt-1 text-[13px] text-mist-400">See which pull requests it has verified.</p>
          <AddressSearch />
        </Card>
      </section>

      <section>
        <SectionTitle>How a claim gets verified</SectionTitle>
        <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-x-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-deep-600 bg-deep-900 text-[13px] font-medium text-mist-200">
                {i + 1}
              </span>
              <div>
                <h3 className="text-[15px] font-medium text-mist-100">{s.title}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-mist-400">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid items-start gap-8 lg:grid-cols-2">
        <div>
          <SectionTitle>Two facts, both from GitHub</SectionTitle>
          <p className="text-[14px] leading-relaxed text-mist-400">
            The contract never asks a model whether a contribution is "good". It only asks validators to read two facts out of GitHub's
            own responses: the pull request was merged by your username, and your wallet address is in your bio. The contract's own code
            then requires both to be true.
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-mist-400">
            If a check fails, you see which of the two failed and why, and you can try again after a day.
          </p>
        </div>
        <div>
          <p className="mb-2 text-[12px] text-mist-500">Example result (not real data)</p>
          <ClaimReceipt attestation={SAMPLE} />
        </div>
      </section>

      {top.length > 0 && (
        <section>
          <SectionTitle
            aside={
              <Link to="/registry" className="text-[13px] text-beacon-300 hover:text-beacon-200">
                See everyone
              </Link>
            }
          >
            Most verified wallets
          </SectionTitle>
          <ul className="divide-y divide-deep-800 overflow-hidden rounded-lg border border-deep-700 bg-deep-900/60">
            {top.map((r) => (
              <li key={r.address}>
                <Link to={`/profile/${r.address}`} className="flex items-center justify-between px-4 py-3 hover:bg-deep-850">
                  <span className="font-mono text-[13px] text-mist-100">{shortAddress(r.address, 6)}</span>
                  <span className="text-[13px] text-mist-200">
                    {r.reputation} {r.reputation === 1 ? "pull request" : "pull requests"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle>What this doesn't prove</SectionTitle>
        <ul className="grid gap-4 text-[13.5px] leading-relaxed text-mist-400 sm:grid-cols-3">
          <li className="rounded-lg border border-deep-700 p-4">
            Control of the GitHub account is proven at the moment of the check, not continuously.
          </li>
          <li className="rounded-lg border border-deep-700 p-4">
            The count is how many merged pull requests, not how large, hard or important they were.
          </li>
          <li className="rounded-lg border border-deep-700 p-4">
            GitHub limits unauthenticated requests, so a check can fail for a moment and succeed on retry.
          </li>
        </ul>
      </section>
    </div>
  );
}
