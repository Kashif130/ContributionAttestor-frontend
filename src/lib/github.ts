// Client-side mirror of the contract's input rules, so people see a plain-language message before
// they spend gas on a transaction the contract would reject anyway.

export const MAX_USERNAME_LENGTH = 39;
export const MAX_NOTE_LENGTH = 500;
export const MAX_PR_NUMBER = 999_999_999;
export const RECHECK_COOLDOWN_SECONDS = 86_400;
/** Paid to whoever triggers a successful verification, while the pool can afford it. */
export const KEEPER_REWARD_WEI = 500_000_000_000_000n;

export interface ParsedRepo {
  owner: string;
  repo: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const SEGMENT_RE = /^[A-Za-z0-9\-_.]+$/;

/** Same shape rules as `_require_github_repo_url`: github.com host, exactly owner/repo. */
export function parseRepoUrl(raw: string): Parsed<ParsedRepo> {
  const url = raw.trim();
  if (url.length < 10 || url.length > 300) return { ok: false, error: "The repository link must be 10 to 300 characters." };
  const lowered = url.toLowerCase();
  if (!(lowered.startsWith("https://") || lowered.startsWith("http://"))) {
    return { ok: false, error: "The repository link must start with https://" };
  }
  if (url.includes("@")) return { ok: false, error: "The link can't contain credentials." };
  if (/\s/.test(url)) return { ok: false, error: "The link can't contain spaces." };

  const rest = url.slice(url.indexOf("://") + 3);
  const slash = rest.indexOf("/");
  const hostPart = slash === -1 ? rest : rest.slice(0, slash);
  const host = hostPart.split(":")[0].toLowerCase().replace(/^www\./, "");
  if (host !== "github.com") return { ok: false, error: "The repository must be on github.com." };

  const path = (slash === -1 ? "" : rest.slice(slash + 1)).split("?")[0].split("#")[0].replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 2) return { ok: false, error: "Use the repository home page, like https://github.com/owner/repo" };

  const owner = segments[0];
  let repo = segments[1];
  if (repo.endsWith(".git")) repo = repo.slice(0, -4);
  for (const [part, label] of [[owner, "owner"], [repo, "repository name"]] as const) {
    if (part.length === 0 || part.length > 100 || !SEGMENT_RE.test(part)) {
      return { ok: false, error: `The ${label} in the link has characters GitHub doesn't allow.` };
    }
  }
  return { ok: true, value: { owner, repo } };
}

/** Same rules as `_require_valid_username`. */
export function validateUsername(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 1 || name.length > MAX_USERNAME_LENGTH) return `A GitHub username is 1 to ${MAX_USERNAME_LENGTH} characters.`;
  if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) return "That isn't a valid GitHub username.";
  if (!/^[A-Za-z0-9-]+$/.test(name)) return "Usernames can only have letters, digits and hyphens.";
  return null;
}

/** Same rule as `_require_valid_pr_number`. Returns the number, or an error message. */
export function parsePrNumber(raw: string): Parsed<number> {
  const t = raw.trim().replace(/^#/, "");
  if (!/^\d+$/.test(t)) return { ok: false, error: "The pull request number must be a whole number." };
  const n = Number(t);
  if (n <= 0 || n > MAX_PR_NUMBER) return { ok: false, error: "That pull request number is out of range." };
  return { ok: true, value: n };
}

/** Pulls owner, repo and PR number out of a full pull request link, to save people typing. */
export function parsePullRequestLink(raw: string): { repoUrl: string; pr: string } | null {
  const m = raw.trim().match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9\-_.]+)\/([A-Za-z0-9\-_.]+)\/pull\/(\d+)/i);
  if (!m) return null;
  return { repoUrl: `https://github.com/${m[1]}/${m[2]}`, pr: m[3] };
}

/** "owner/repo#123", the key the contract uses for a contribution. */
export function claimKeyOf(owner: string, repo: string, pr: number): string {
  return `${owner}/${repo}#${pr}`;
}

/** Splits a stored claim key back into its parts. */
export function splitClaimKey(key: string): { owner: string; repo: string; pr: number } | null {
  const m = key.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  return m ? { owner: m[1], repo: m[2], pr: Number(m[3]) } : null;
}

export function pullRequestUrl(key: string): string {
  const p = splitClaimKey(key);
  return p ? `https://github.com/${p.owner}/${p.repo}/pull/${p.pr}` : "https://github.com";
}

export function profileUrl(username: string): string {
  return `https://github.com/${encodeURIComponent(username)}`;
}
