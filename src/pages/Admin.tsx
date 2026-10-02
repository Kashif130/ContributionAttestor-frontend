import { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useRunner } from "../hooks/useRunner";
import { useBlacklistStatus } from "../hooks/data";
import { blacklistAddress, unblacklistAddress } from "../lib/client";
import { ADDRESS_RE, isContractConfigured } from "../lib/networks";
import { Button, Card, HelperText, Input, Label, Notice, PageHeader } from "../components/ui";

export function Admin() {
  const wallet = useWallet();
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const targetOk = ADDRESS_RE.test(target.trim());
  const addr = targetOk ? target.trim() : null;
  const status = useBlacklistStatus(addr);
  const { busy, run } = useRunner(async () => {
    await status.refresh();
  });

  const reasonOk = reason.trim().length >= 3 && reason.length <= 300;
  const blocked = status.data?.blacklisted === true;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Admin">
        The admin can flag a wallet. A flagged wallet reads as 0 verified pull requests and can't register or verify claims. The admin
        can't undo a verified claim, move funds, or change what a check decides.
      </PageHeader>

      {!isContractConfigured && (
        <div className="mt-6">
          <Notice tone="warn" title="No contract configured">
            Set VITE_CONTRACT_ADDRESS, or paste an address in the network menu, before sending anything.
          </Notice>
        </div>
      )}

      <div className="mt-6">
        <Notice tone="info" title="Only the deploying wallet can use these buttons">
          The contract rejects anyone else. {wallet.address ? "" : "Connect the admin wallet first."}
        </Notice>
      </div>

      <Card className="mt-8 p-5">
        <div className="space-y-4">
          <div>
            <Label>Wallet address</Label>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className="font-mono"
              aria-invalid={!!target.trim() && !targetOk}
            />
            {target.trim() && !targetOk && <HelperText tone="error">Enter a full wallet address.</HelperText>}
          </div>

          {addr && status.data && (
            <Notice tone={blocked ? "error" : "success"} title={blocked ? "Currently blacklisted" : "Not blacklisted"}>
              {blocked && status.data.reason ? `Reason on record: ${status.data.reason}` : undefined}
            </Notice>
          )}

          <div>
            <Label hint={`${reason.length}/300`}>Reason (3 to 300 characters)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this wallet is being flagged" maxLength={300} />
            <HelperText>The reason is public. Only needed when blacklisting.</HelperText>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              disabled={!targetOk || !reasonOk || !wallet.address || busy !== null}
              loading={busy === "black"}
              onClick={() => run("black", (s) => blacklistAddress(s, addr as string, reason.trim()), "Wallet blacklisted")}
            >
              Blacklist wallet
            </Button>
            <Button
              variant="secondary"
              disabled={!targetOk || !wallet.address || busy !== null}
              loading={busy === "unblack"}
              onClick={() => run("unblack", (s) => unblacklistAddress(s, addr as string), "Wallet reinstated")}
            >
              Reinstate wallet
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
