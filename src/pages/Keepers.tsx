import { useState } from "react";
import { Coins, ShieldCheck } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useRunner } from "../hooks/useRunner";
import { useClaimInput } from "../hooks/useClaimInput";
import { useAttestation, useRewardPool } from "../hooks/data";
import { useCountdown } from "../hooks/useCountdown";
import { fundRewards, verifyContribution } from "../lib/client";
import { KEEPER_REWARD_WEI, RECHECK_COOLDOWN_SECONDS } from "../lib/github";
import { fromWei, formatWait, isValidAmount, isoToUnixSeconds, NATIVE_SYMBOL, toWei } from "../lib/format";
import { ADDRESS_RE, isContractConfigured } from "../lib/networks";
import { ClaimReceipt } from "../components/receipt";
import { ClaimTarget } from "../components/ClaimTarget";
import { Button, Card, HelperText, Input, Label, Notice, PageHeader, SectionTitle } from "../components/ui";

function FundPool() {
  const pool = useRewardPool();
  const [amount, setAmount] = useState("");
  const { busy, run } = useRunner(async () => {
    await pool.refresh();
    setAmount("");
  });
  const valid = isValidAmount(amount);

  return (
    <Card className="p-5">
      <p className="text-[13px] text-mist-500">Reward pool</p>
      <p className="mt-1 font-display text-[28px] font-semibold text-mist-100">
        {pool.data !== null ? `${fromWei(pool.data)} ${NATIVE_SYMBOL}` : "…"}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-mist-400">
        Whoever triggers a check that ends in a verified claim gets {fromWei(KEEPER_REWARD_WEI)} {NATIVE_SYMBOL} from this pool, while it
        lasts. A check that fails earns nothing.
      </p>
      <div className="mt-4">
        <Label>Add to the pool</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Amount in ${NATIVE_SYMBOL}`} inputMode="decimal" />
          <Button
            variant="secondary"
            className="sm:shrink-0"
            disabled={!valid || busy !== null}
            loading={busy === "fund"}
            icon={<Coins className="h-4 w-4" aria-hidden />}
            onClick={() => run("fund", (s) => fundRewards(s, toWei(amount)), "Pool funded", `${amount} ${NATIVE_SYMBOL} added.`)}
          >
            Fund pool
          </Button>
        </div>
        {amount && !valid && <HelperText tone="error">Enter a number like 0.5.</HelperText>}
      </div>
    </Card>
  );
}

function RunCheckForOthers() {
  const wallet = useWallet();
  const input = useClaimInput();
  const [claimant, setClaimant] = useState("");
  const claimantOk = ADDRESS_RE.test(claimant.trim());
  const addr = claimantOk ? claimant.trim() : null;

  const att = useAttestation(input.repoUrl, input.prNumber, addr);
  const { busy, run } = useRunner(async () => {
    await att.refresh();
  });

  const a = att.data;
  const nextAt = a && a.attempts > 0 ? isoToUnixSeconds(a.last_checked_at) + RECHECK_COOLDOWN_SECONDS : null;
  const waitLeft = useCountdown(nextAt);
  const ready = !!addr && !!input.repoUrl && input.prNumber !== null;
  const canRun = ready && !!a && a.status !== "VERIFIED" && waitLeft === 0 && !!wallet.address;

  return (
    <Card className="p-5">
      <div className="space-y-4">
        <div>
          <Label>Claimant wallet</Label>
          <Input
            value={claimant}
            onChange={(e) => setClaimant(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className="font-mono"
            aria-invalid={!!claimant.trim() && !claimantOk}
          />
          {claimant.trim() && !claimantOk && <HelperText tone="error">Enter a full wallet address.</HelperText>}
        </div>
        <ClaimTarget input={input} />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() =>
              run(
                "keeper-verify",
                (s) => verifyContribution(s, addr as string, input.repoUrl as string, input.prNumber as number),
                "Check finished",
                "The result is shown below.",
              )
            }
            disabled={!canRun || busy !== null}
            loading={busy === "keeper-verify"}
            icon={busy === "keeper-verify" ? undefined : <ShieldCheck className="h-4 w-4" aria-hidden />}
          >
            {busy === "keeper-verify" ? "Validators are checking" : "Run check"}
          </Button>
          {ready && !att.loading && !a && <p className="text-[12.5px] text-mist-500">That wallet hasn't registered this claim, so there is nothing to check.</p>}
          {waitLeft > 0 && a?.status !== "VERIFIED" && <p className="text-[12.5px] text-mist-500">Next check possible in {formatWait(waitLeft)}.</p>}
          {!wallet.address && <p className="text-[12.5px] text-mist-500">Connect a wallet to send the check.</p>}
        </div>
      </div>
      {a && (
        <div className="mt-5">
          <ClaimReceipt attestation={a} />
        </div>
      )}
    </Card>
  );
}

export function Keepers() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Keepers">
        Anyone can run the check for someone else's claim. You choose when it runs, never what it checks: the contract always re-reads
        the username the claimant registered for themselves.
      </PageHeader>

      {!isContractConfigured && (
        <div className="mt-6">
          <Notice tone="warn" title="No contract configured">
            Set VITE_CONTRACT_ADDRESS, or paste an address in the network menu, before sending anything.
          </Notice>
        </div>
      )}

      <div className="mt-8 space-y-10">
        <FundPool />
        <div>
          <SectionTitle>Run a check for another wallet</SectionTitle>
          <RunCheckForOthers />
        </div>
      </div>
    </div>
  );
}
