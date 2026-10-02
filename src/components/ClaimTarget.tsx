import type { ClaimInput } from "../hooks/useClaimInput";
import { HelperText, Input, Label } from "./ui";

/** The repository and pull-request-number fields, with the contract's own rules as live hints. */
export function ClaimTarget({ input }: { input: ClaimInput }) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
      <div>
        <Label>Repository link</Label>
        <Input
          value={input.repo}
          onChange={(e) => input.setRepo(e.target.value)}
          placeholder="https://github.com/owner/repo"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          aria-invalid={!!input.repoError}
        />
        {input.repoError ? (
          <HelperText tone="error">{input.repoError}</HelperText>
        ) : (
          <HelperText>Tip: paste the full pull request link and both fields fill in.</HelperText>
        )}
      </div>
      <div>
        <Label>PR number</Label>
        <Input
          value={input.pr}
          onChange={(e) => input.setPr(e.target.value)}
          placeholder="123"
          inputMode="numeric"
          aria-invalid={!!input.prError}
        />
        {input.prError && <HelperText tone="error">{input.prError}</HelperText>}
      </div>
    </div>
  );
}
