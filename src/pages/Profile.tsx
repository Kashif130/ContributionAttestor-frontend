import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, GitMerge } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useBlacklistStatus, useReputation, useVerifiedClaims } from "../hooks/data";
import { ADDRESS_RE, isContractConfigured } from "../lib/networks";
import { profileUrl, pullRequestUrl, splitClaimKey } from "../lib/github";
import { formatIsoTimestamp, sameAddress } from "../lib/format";
import { buttonClass, Button, Card, CopyButton, EmptyState, Input, Label, Notice, PageHeader, SectionTitle, Spinner } from "../components/ui";

export function AddressSearch({ buttonLabel = "Look up" }: { buttonLabel?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (!ADDRESS_RE.test(v)) {
      setError("Enter a full wallet address that starts with 0x and has 40 characters after it.");
      return;
    }
    setError(null);
    navigate(`/profile/${v}`);
  };

  return (
    <form onSubmit={submit} noValidate>
      <Label>Wallet address</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className="font-mono"
          aria-invalid={!!error}
        />
        <Button type="submit" className="sm:shrink-0">
          {buttonLabel}
        </Button>
      </div>
      {error && <p className="mt-1.5 text-[12px] text-ember-400">{error}</p>}
    </form>
  );
}

export function Profile() {
  const params = useParams<{ address?: string }>();
  const wallet = useWallet();
  const requested = params.address ?? wallet.address ?? null;
  const valid = !!requested && ADDRESS_RE.test(requested);
  const address = valid ? (requested as string) : null;
  const isYou = sameAddress(address, wallet.address);

  const rep = useReputation(address);
  const claims = useVerifiedClaims(address);
  const black = useBlacklistStatus(address);

  if (!requested) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Look up a profile">Enter any wallet address to see the pull requests it has verified, or connect your own wallet.</PageHeader>
        <Card className="mt-8 p-5">
          <AddressSearch />
        </Card>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="That isn't a wallet address" />
        <Card className="mt-8 p-5">
          <AddressSearch />
        </Card>
      </div>
    );
  }

  const count = rep.data ?? 0;
  const rows = [...(claims.data ?? [])].sort((a, b) => (b.merged_at || "").localeCompare(a.merged_at || ""));
  const loading = (rep.loading && rep.data === null) || (claims.loading && claims.data === null);

  return (
    <div className="mx-auto max-w-3xl">
      {!isContractConfigured && (
        <div className="mb-6">
          <Notice tone="warn" title="No contract configured">
            Set VITE_CONTRACT_ADDRESS, or paste an address in the network menu, to read profiles.
          </Notice>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-mist-500">{isYou ? "Your profile" : "Profile"}</p>
          <p className="mt-1 break-all font-mono text-[14px] text-mist-200">{address}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <CopyButton value={address} label="Copy address" />
            <CopyButton value={typeof window !== "undefined" ? window.location.origin + `/profile/${address}` : ""} label="Copy profile link" />
          </div>
        </div>
        {isYou && (
          <Link to="/claim" className={buttonClass("primary")}>
            Claim another pull request
          </Link>
        )}
      </div>

      {black.data?.blacklisted && (
        <div className="mt-6">
          <Notice tone="error" title="This address has been blacklisted by the admin">
            Its count reads as 0 and it can't register or verify claims.{black.data.reason ? ` Reason given: ${black.data.reason}` : ""}
          </Notice>
        </div>
      )}

      <section className="mt-8 rounded-lg border border-deep-700 bg-deep-900/80 p-6 shadow-sheet">
        {loading ? (
          <div className="flex items-center gap-2 text-[14px] text-mist-400">
            <Spinner /> Reading the registry
          </div>
        ) : (
          <>
            <p className="font-display text-[34px] font-semibold leading-tight text-mist-100">
              {count} verified {count === 1 ? "pull request" : "pull requests"}
            </p>
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-mist-400">
              Each one was merged on GitHub under an account this wallet proved it controls. The count says how many, not how big
              or how good.
            </p>
          </>
        )}
      </section>

      <div className="mt-10">
        <SectionTitle>Verified pull requests</SectionTitle>
        {claims.error && <Notice tone="error" title="Couldn't read the claims">{claims.error}</Notice>}
        {!claims.error && rows.length === 0 && !loading && (
          <EmptyState title="Nothing verified yet">
            {isYou ? (
              <>
                Claim a merged pull request and it will show up here.{" "}
                <Link to="/claim" className="text-beacon-300 underline underline-offset-2">
                  Start a claim
                </Link>
              </>
            ) : (
              "This wallet hasn't verified a pull request."
            )}
          </EmptyState>
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-deep-800 overflow-hidden rounded-lg border border-deep-700 bg-deep-900/60">
            {rows.map((c) => {
              const p = splitClaimKey(c.claim_key);
              return (
                <li key={c.claim_key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <a
                    href={pullRequestUrl(c.claim_key)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="group inline-flex min-w-0 items-center gap-2 font-mono text-[13.5px] text-mist-100 hover:text-beacon-300"
                  >
                    <GitMerge className="h-4 w-4 shrink-0 text-beacon-400" aria-hidden />
                    <span className="break-all">
                      {p ? `${p.owner}/${p.repo}` : c.claim_key}
                      {p && <span className="text-beacon-300"> #{p.pr}</span>}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-mist-600 group-hover:text-beacon-300" aria-hidden />
                  </a>
                  <p className="text-[12.5px] text-mist-400">
                    <a href={profileUrl(c.github_username)} target="_blank" rel="noreferrer noopener" className="text-mist-200 hover:text-beacon-300">
                      @{c.github_username}
                    </a>
                    {c.merged_at ? ` · merged ${formatIsoTimestamp(c.merged_at)}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
