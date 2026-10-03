import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, ShieldCheck, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { useWallet } from "../context/WalletContext";
import { useRunner } from "../hooks/useRunner";
import { useClaimInput } from "../hooks/useClaimInput";
import { useAttestation, useBioProof, useReputation } from "../hooks/data";
import { useCountdown } from "../hooks/useCountdown";
import { registerClaim, verifyContribution } from "../lib/client";
import { MAX_NOTE_LENGTH, RECHECK_COOLDOWN_SECONDS, validateUsername } from "../lib/github";
import { formatWait, isoToUnixSeconds } from "../lib/format";
import { isContractConfigured } from "../lib/networks";
import { ClaimReceipt } from "../components/receipt";
import { findLatestMergedPr, previewCheck, type PreviewResult } from "../lib/preview";
import { ClaimTarget } from "../components/ClaimTarget";
import { Button, CopyButton, HelperText, Input, Label, Notice, PageHeader, Textarea } from "../components/ui";

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[2rem_1fr] gap-x-4">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-medium ${
            done ? "border-jade-500/60 bg-jade-500/10 text-jade-400" : "border-deep-600 bg-deep-900 text-mist-200"
          }`}
        >
          {n}
        </span>
        <span className="mt-2 w-px flex-1 bg-deep-700" aria-hidden />
      </div>
      <div className="pb-10">
        <h2 className="font-display text-[19px] font-semibold text-mist-100">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

export function Claim() {
  const wallet = useWallet();
  const address = wallet.address;
  const target = useClaimInput();
  const [username, setUsername] = useState("");
  const [note, setNote] = useState("");

  const proof = useBioProof(address);
  const att = useAttestation(target.repoUrl, target.prNumber, address);
  const rep = useReputation(address);
  const attestation = att.data;

  const { busy, run } = useRunner(async () => {
    await Promise.all([att.refresh(), rep.refresh()]);
  });

  // When a claim already exists for this pull request, show what was registered.
  useEffect(() => {
    if (attestation && !username) setUsername(attestation.github_username);
    if (attestation && !note && attestation.note) setNote(attestation.note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attestation]);

  // Sandbox: autofill from GitHub, and a free preview of what the validators would decide.
  const [sandboxBusy, setSandboxBusy] = useState<"autofill" | "preview" | null>(null);
  const [sandboxMsg, setSandboxMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  // A preview describes one exact set of inputs, so drop it as soon as any of them change.
  useEffect(() => {
    setPreview(null);
  }, [target.repoUrl, target.prNumber, username, address]);

  const onAutofill = async () => {
    setSandboxBusy("autofill");
    setSandboxMsg(null);
    setPreview(null);
    const found = await findLatestMergedPr(username);
    if ("error" in found) setSandboxMsg(found.error);
    else {
      target.setRepo(found.repoUrl);
      target.setPr(String(found.pr));
      setSandboxMsg(`Filled in ${found.repoUrl.replace("https://github.com/", "")} #${found.pr}.`);
    }
    setSandboxBusy(null);
  };

  const onPreview = async () => {
    if (!address || !target.repoUrl || target.prNumber === null) return;
    const [owner, repo] = target.repoUrl.replace("https://github.com/", "").split("/");
    setSandboxBusy("preview");
    setSandboxMsg(null);
    setPreview(await previewCheck(owner, repo, target.prNumber, username, address));
    setSandboxBusy(null);
  };

  const usernameError = username.trim() ? validateUsername(username) : null;
  const canRegister =
    !!address && !!target.repoUrl && target.prNumber !== null && !!username.trim() && !usernameError && attestation?.status !== "VERIFIED";

  const nextCheckAt =
    attestation && attestation.attempts > 0 ? isoToUnixSeconds(attestation.last_checked_at) + RECHECK_COOLDOWN_SECONDS : null;
  const waitLeft = useCountdown(nextCheckAt);
  const registered = !!attestation;
  const verified = attestation?.status === "VERIFIED";
  const canVerify = !!address && registered && !verified && waitLeft === 0;

  const onRegister = () =>
    run(
      "register",
      (s) => registerClaim(s, username.trim(), target.repoUrl as string, target.prNumber as number, note.trim()),
      registered ? "Claim updated" : "Claim registered",
      "Next, run the check.",
    );

  const onVerify = () =>
    run(
      "verify",
      (s) => verifyContribution(s, address as string, target.repoUrl as string, target.prNumber as number),
      "Check finished",
      "The result is shown below the form.",
    );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Claim a merged pull request">
        Link your wallet to a pull request you wrote. Validators read GitHub directly, so there is nothing to upload and no one to
        ask for approval.
      </PageHeader>

      {!isContractConfigured && (
        <div className="mt-6">
          <Notice tone="warn" title="No contract configured">
            Set VITE_CONTRACT_ADDRESS, or paste an address in the network menu, before sending anything.
          </Notice>
        </div>
      )}

      {!address && (
        <div className="mt-6">
          <Notice tone="info" title="Connect a wallet to begin">
            Use the wallet button at the top. The claim is tied to the address you connect.
          </Notice>
        </div>
      )}

      <div className="mt-10">
        <Step n={1} title="Put your wallet address in your GitHub bio" done={att.data?.bio_status === "ADDRESS_FOUND"}>
          <p className="text-[14px] leading-relaxed text-mist-400">
            This shows you control the GitHub account. Add the text below anywhere in your profile bio and save it. It is checked
            when you run the check in step 3, so you can remove it afterwards.
          </p>
          <div className="mt-3 rounded-md border border-deep-600 bg-deep-950/60 p-3">
            {address ? (
              <>
                <p className="break-all font-mono text-[13px] text-mist-100">{proof.data ?? "Loading…"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  {proof.data && <CopyButton value={proof.data} label="Copy proof text" />}
                  <a
                    href="https://github.com/settings/profile"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[12px] text-mist-400 underline decoration-deep-600 underline-offset-2 hover:text-beacon-300"
                  >
                    Open GitHub profile settings
                  </a>
                </div>
              </>
            ) : (
              <p className="text-[13px] text-mist-500">Connect a wallet to see your proof text.</p>
            )}
          </div>
        </Step>

        <Step n={2} title="Register the claim" done={registered}>
          <div className="space-y-4">
            <ClaimTarget input={target} />
            <div>
              <Label>Your GitHub username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="octocat"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                aria-invalid={!!usernameError}
              />
              {usernameError ? (
                <HelperText tone="error">{usernameError}</HelperText>
              ) : (
                <HelperText>The account that opened the pull request.</HelperText>
              )}
            </div>
            <div>
              <Label hint={`${note.length}/${MAX_NOTE_LENGTH}`}>Note (optional)</Label>
              <Textarea
                rows={2}
                maxLength={MAX_NOTE_LENGTH}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What the change did"
              />
            </div>
            <div className="rounded-md border border-deep-600 bg-deep-950/60 p-3">
              <p className="text-[12.5px] font-medium text-mist-200">Testing? Try the sandbox</p>
              <p className="mt-1 text-[12.5px] text-mist-500">
                Enter a GitHub username, then autofill its latest merged pull request. The preview asks GitHub the same two
                questions the validators will, for free and with no transaction.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={onAutofill}
                  disabled={!username.trim() || !!usernameError || sandboxBusy !== null}
                  loading={sandboxBusy === "autofill"}
                  icon={<Wand2 className="h-4 w-4" aria-hidden />}
                >
                  Autofill latest merged PR
                </Button>
                <Button
                  variant="secondary"
                  onClick={onPreview}
                  disabled={!address || !target.repoUrl || target.prNumber === null || !username.trim() || !!usernameError || sandboxBusy !== null}
                  loading={sandboxBusy === "preview"}
                  icon={<Eye className="h-4 w-4" aria-hidden />}
                >
                  Preview check (free)
                </Button>
              </div>
              {sandboxMsg && <p className="mt-2 text-[12.5px] text-mist-400">{sandboxMsg}</p>}
              {preview && (
                <div className="mt-3 space-y-2">
                  <Notice tone={preview.pr.status === "MERGED_BY_AUTHOR" ? "success" : "warn"} title="Pull request">
                    {preview.pr.detail}
                  </Notice>
                  <Notice tone={preview.bio.status === "ADDRESS_FOUND" ? "success" : "warn"} title="GitHub bio">
                    {preview.bio.detail}
                  </Notice>
                  <Notice tone={preview.wouldVerify ? "success" : "info"} title={preview.wouldVerify ? "This claim should verify" : "Not ready yet"}>
                    {preview.wouldVerify
                      ? "Both checks pass. Register the claim, then run the check."
                      : "Fix the items above, then preview again. Only the on-chain check counts."}
                  </Notice>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onRegister} disabled={!canRegister || busy !== null} loading={busy === "register"}>
                {registered ? "Update claim" : "Register claim"}
              </Button>
              {registered && !verified && (
                <p className="text-[12.5px] text-mist-500">Updating a claim clears the result of any earlier check.</p>
              )}
            </div>
          </div>
        </Step>

        <Step n={3} title="Run the check" done={verified}>
          <p className="text-[14px] leading-relaxed text-mist-400">
            Validators ask GitHub two things: was the pull request merged by your username, and is your wallet address in your bio.
            Both must be true. This takes a minute or two while validators agree.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              onClick={onVerify}
              disabled={!canVerify || busy !== null}
              loading={busy === "verify"}
              icon={busy === "verify" ? undefined : <ShieldCheck className="h-4 w-4" aria-hidden />}
            >
              {busy === "verify" ? "Validators are checking" : "Run check"}
            </Button>
            {waitLeft > 0 && !verified && (
              <p className="text-[12.5px] text-mist-500">You can check again in {formatWait(waitLeft)}.</p>
            )}
            {!address && <p className="text-[12.5px] text-mist-500">Connect a wallet first.</p>}
            {address && !registered && (
              <p className="text-[12.5px] text-mist-500">
                {target.repoUrl && target.prNumber !== null
                  ? "Register the claim first."
                  : "Fill in the repository and PR number in step 2, then register the claim."}
              </p>
            )}
          </div>
        </Step>
      </div>

      {attestation && (
        <div className="space-y-4">
          <ClaimReceipt attestation={attestation} />
          {verified && (
            <Notice tone="success" title="This pull request is locked to your wallet">
              Your verified count is now {rep.data ?? "…"}.{" "}
              <Link to={`/profile/${address}`} className="text-beacon-300 underline underline-offset-2">
                View your profile
              </Link>
            </Notice>
          )}
        </div>
      )}
    </div>
  );
}
