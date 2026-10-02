import { useMemo, useState } from "react";
import { parsePrNumber, parsePullRequestLink, parseRepoUrl } from "../lib/github";

/**
 * State for the "which pull request" fields shared by several pages. Pasting a full pull request
 * link into the repository box fills both fields. `repoUrl` and `prNumber` stay null until each
 * field passes the same rules the contract applies.
 */
export function useClaimInput() {
  const [repo, setRepoRaw] = useState("");
  const [pr, setPr] = useState("");

  const setRepo = (value: string) => {
    const link = parsePullRequestLink(value);
    if (link) {
      setRepoRaw(link.repoUrl);
      setPr(link.pr);
    } else {
      setRepoRaw(value);
    }
  };

  return useMemo(() => {
    const parsedRepo = repo.trim() ? parseRepoUrl(repo) : null;
    const parsedPr = pr.trim() ? parsePrNumber(pr) : null;
    const repoUrl = parsedRepo?.ok ? `https://github.com/${parsedRepo.value.owner}/${parsedRepo.value.repo}` : null;
    const prNumber = parsedPr?.ok ? parsedPr.value : null;
    return {
      repo,
      pr,
      setRepo,
      setPr,
      repoUrl,
      prNumber,
      repoError: parsedRepo && !parsedRepo.ok ? parsedRepo.error : null,
      prError: parsedPr && !parsedPr.ok ? parsedPr.error : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, pr]);
}

export type ClaimInput = ReturnType<typeof useClaimInput>;
