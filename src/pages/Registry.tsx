import { useState } from "react";
import { Link } from "react-router-dom";
import { useLeaderboard } from "../hooks/data";
import { useClaimInput } from "../hooks/useClaimInput";
import { usePolled } from "../hooks/usePolled";
import { getVerifiedOwner } from "../lib/client";
import { isContractConfigured } from "../lib/networks";
import { ClaimTarget } from "../components/ClaimTarget";
import { Card, EmptyState, Input, Label, Notice, PageHeader, SectionTitle, Spinner } from "../components/ui";
import { shortAddress, sameAddress } from "../lib/format";
import { useWallet } from "../context/WalletContext";

function OwnerCheck() {
  const input = useClaimInput();
  const owner = usePolled(
    () => getVerifiedOwner(input.repoUrl as string, input.prNumber as number),
    [input.repoUrl, input.prNumber],
    20_000,
    !!input.repoUrl && input.prNumber !== null,
  );
  const ready = !!input.repoUrl && input.prNumber !== null;

  return (
    <Card className="p-5">
      <ClaimTarget input={input} />
      <div className="mt-4 min-h-[2.5rem] text-[14px]">
        {!ready && <p className="text-mist-500">Enter a repository and a pull request number.</p>}
        {ready && owner.loading && owner.data === null && (
          <p className="flex items-center gap-2 text-mist-400">
            <Spinner /> Checking the registry
          </p>
        )}
        {ready && owner.error && <p className="text-ember-400">{owner.error}</p>}
        {ready && !owner.loading && !owner.error && owner.data !== null &&
          (owner.data ? (
            <p className="text-mist-200">
              Verified for{" "}
              <Link to={`/profile/${owner.data}`} className="font-mono text-beacon-300 underline underline-offset-2">
                {shortAddress(owner.data, 6)}
              </Link>
              . It is locked to that wallet and can't move.
            </p>
          ) : (
            <p className="text-mist-200">No wallet has verified this pull request yet.</p>
          ))}
      </div>
    </Card>
  );
}

export function Registry() {
  const board = useLeaderboard();
  const wallet = useWallet();
  const [filter, setFilter] = useState("");
  const all = board.data ?? [];
  const f = filter.trim().toLowerCase();
  const rows = f ? all.filter((r) => r.address.toLowerCase().includes(f)) : all;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Registry">Every wallet with at least one verified pull request, most first.</PageHeader>

      {!isContractConfigured && (
        <div className="mt-6">
          <Notice tone="warn" title="No contract configured">
            Set VITE_CONTRACT_ADDRESS, or paste an address in the network menu, to read the registry.
          </Notice>
        </div>
      )}

      <div className="mt-8">
        <SectionTitle aside={all.length > 0 ? <span className="text-[12px] text-mist-500">{all.length} wallets</span> : undefined}>
          Verified wallets
        </SectionTitle>
        <div className="mb-3 max-w-sm">
          <Label>Filter by address</Label>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="0x…" spellCheck={false} className="font-mono" />
        </div>
        {board.loading && board.data === null && (
          <p className="flex items-center gap-2 text-[14px] text-mist-400">
            <Spinner /> Reading the registry
          </p>
        )}
        {board.error && <Notice tone="error" title="Couldn't read the registry">{board.error}</Notice>}
        {!board.loading && !board.error && rows.length === 0 && (
          <EmptyState title={f ? "No wallet matches that filter" : "No one is verified yet"}>
            {!f && (
              <Link to="/claim" className="text-beacon-300 underline underline-offset-2">
                Be the first to claim a pull request
              </Link>
            )}
          </EmptyState>
        )}
        {rows.length > 0 && (
          <ol className="divide-y divide-deep-800 overflow-hidden rounded-lg border border-deep-700 bg-deep-900/60">
            {rows.map((r, i) => (
              <li key={r.address}>
                <Link to={`/profile/${r.address}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-deep-850">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-7 shrink-0 text-right font-mono text-[12px] text-mist-500">{f ? "" : i + 1}</span>
                    <span className="truncate font-mono text-[13px] text-mist-100">{r.address}</span>
                    {sameAddress(r.address, wallet.address) && (
                      <span className="rounded-full bg-beacon-400/20 px-1.5 text-[10px] text-beacon-300">you</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[13px] text-mist-200">
                    {r.reputation} {r.reputation === 1 ? "PR" : "PRs"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-12">
        <SectionTitle>Who verified a pull request?</SectionTitle>
        <OwnerCheck />
      </div>
    </div>
  );
}
