// Sandbox helpers: ask GitHub the same two questions the validators ask, straight from the browser,
// so a tester sees the likely outcome (and exactly what is missing) before sending a transaction.
// Nothing here touches the chain and nothing is stored.

export type PrPreviewStatus = "MERGED_BY_AUTHOR" | "NOT_MERGED_OR_WRONG_AUTHOR" | "FETCH_UNAVAILABLE";
export type BioPreviewStatus = "ADDRESS_FOUND" | "ADDRESS_NOT_FOUND" | "FETCH_UNAVAILABLE";

export interface PreviewResult {
  pr: { status: PrPreviewStatus; detail: string; mergedAt: string };
  bio: { status: BioPreviewStatus; detail: string };
  wouldVerify: boolean;
}

const API = "https://api.github.com";

/** Same rule as the contract: "merged" is literally true and user.login equals the username (any case). */
export function evaluatePr(json: unknown, username: string): PreviewResult["pr"] {
  const o = json as { merged?: unknown; merged_at?: unknown; user?: { login?: unknown } } | null;
  if (!o || typeof o !== "object" || !("merged" in o)) {
    return { status: "FETCH_UNAVAILABLE", detail: "GitHub did not return a pull request.", mergedAt: "" };
  }
  const login = typeof o.user?.login === "string" ? o.user.login : "";
  const mergedAt = typeof o.merged_at === "string" ? o.merged_at : "";
  if (o.merged !== true) {
    return { status: "NOT_MERGED_OR_WRONG_AUTHOR", detail: "This pull request is not merged yet.", mergedAt };
  }
  if (login.toLowerCase() !== username.trim().toLowerCase()) {
    return {
      status: "NOT_MERGED_OR_WRONG_AUTHOR",
      detail: `This pull request was opened by "${login}", not "${username.trim()}".`,
      mergedAt,
    };
  }
  return { status: "MERGED_BY_AUTHOR", detail: `Merged, and opened by ${login}.`, mergedAt };
}

/** Same rule as the contract: the bio contains the wallet address (case-insensitive). */
export function evaluateBio(json: unknown, address: string): PreviewResult["bio"] {
  const o = json as { bio?: unknown; login?: unknown } | null;
  if (!o || typeof o !== "object" || !("login" in o)) {
    return { status: "FETCH_UNAVAILABLE", detail: "GitHub did not return that profile." };
  }
  const bio = typeof o.bio === "string" ? o.bio : "";
  if (bio.toLowerCase().includes(address.trim().toLowerCase())) {
    return { status: "ADDRESS_FOUND", detail: "Your wallet address is in the bio." };
  }
  return {
    status: "ADDRESS_NOT_FOUND",
    detail: bio ? "The bio is public but does not contain your wallet address." : "The profile bio is empty. Add the proof text from step 1.",
  };
}

async function getJson(url: string): Promise<{ ok: true; json: unknown } | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
    if (res.status === 404) return { ok: false, reason: "GitHub says that does not exist. Check the spelling." };
    if (res.status === 403 || res.status === 429) return { ok: false, reason: "GitHub's rate limit was hit. Try again in a few minutes." };
    if (!res.ok) return { ok: false, reason: `GitHub answered with status ${res.status}.` };
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, reason: "Could not reach GitHub. Check your connection." };
  }
}

export async function previewCheck(owner: string, repo: string, pr: number, username: string, address: string): Promise<PreviewResult> {
  const [prRes, userRes] = await Promise.all([
    getJson(`${API}/repos/${owner}/${repo}/pulls/${pr}`),
    getJson(`${API}/users/${encodeURIComponent(username.trim())}`),
  ]);
  const prOut = prRes.ok
    ? evaluatePr(prRes.json, username)
    : { status: "FETCH_UNAVAILABLE" as const, detail: prRes.reason, mergedAt: "" };
  const bioOut = userRes.ok ? evaluateBio(userRes.json, address) : { status: "FETCH_UNAVAILABLE" as const, detail: userRes.reason };
  return { pr: prOut, bio: bioOut, wouldVerify: prOut.status === "MERGED_BY_AUTHOR" && bioOut.status === "ADDRESS_FOUND" };
}

/** Autofill: the most recently merged public pull request a GitHub user has opened. */
export async function findLatestMergedPr(username: string): Promise<{ repoUrl: string; pr: number } | { error: string }> {
  const q = encodeURIComponent(`author:${username.trim()} is:pr is:merged is:public`);
  const res = await getJson(`${API}/search/issues?q=${q}&sort=updated&order=desc&per_page=1`);
  if (!res.ok) return { error: res.reason };
  const item = (res.json as { items?: { number?: number; repository_url?: string }[] }).items?.[0];
  if (!item?.number || !item.repository_url) return { error: `No merged public pull requests found for "${username.trim()}".` };
  const m = item.repository_url.match(/repos\/([^/]+)\/([^/]+)$/);
  if (!m) return { error: "Could not read the repository from GitHub's answer." };
  return { repoUrl: `https://github.com/${m[1]}/${m[2]}`, pr: item.number };
}
