import { describe, expect, it } from "vitest";
import {
  claimKeyOf,
  parsePrNumber,
  parsePullRequestLink,
  parseRepoUrl,
  pullRequestUrl,
  splitClaimKey,
  validateUsername,
} from "./github";

describe("parseRepoUrl", () => {
  it("accepts plain, www, trailing slash and .git forms", () => {
    for (const u of [
      "https://github.com/vercel/next.js",
      "https://www.github.com/vercel/next.js/",
      "http://github.com/vercel/next.js.git",
      "https://github.com/vercel/next.js?tab=readme#top",
    ]) {
      expect(parseRepoUrl(u)).toEqual({ ok: true, value: { owner: "vercel", repo: "next.js" } });
    }
  });

  it("rejects other hosts, extra paths and credentials", () => {
    expect(parseRepoUrl("https://gitlab.com/a/b").ok).toBe(false);
    expect(parseRepoUrl("https://github.com/owner").ok).toBe(false);
    expect(parseRepoUrl("https://github.com/owner/repo/pull/3").ok).toBe(false);
    expect(parseRepoUrl("https://user@github.com/a/b").ok).toBe(false);
    expect(parseRepoUrl("github.com/a/b").ok).toBe(false);
    expect(parseRepoUrl("https://github.com/a b/c").ok).toBe(false);
    expect(parseRepoUrl("https://github.com/a/b$").ok).toBe(false);
  });
});

describe("validateUsername", () => {
  it("accepts normal handles", () => {
    expect(validateUsername("Kashif130")).toBeNull();
    expect(validateUsername("a-b-c")).toBeNull();
  });
  it("rejects bad handles", () => {
    expect(validateUsername("")).not.toBeNull();
    expect(validateUsername("-abc")).not.toBeNull();
    expect(validateUsername("abc-")).not.toBeNull();
    expect(validateUsername("a--b")).not.toBeNull();
    expect(validateUsername("a_b")).not.toBeNull();
    expect(validateUsername("x".repeat(40))).not.toBeNull();
  });
});

describe("parsePrNumber", () => {
  it("accepts numbers with an optional #", () => {
    expect(parsePrNumber("42")).toEqual({ ok: true, value: 42 });
    expect(parsePrNumber("#42")).toEqual({ ok: true, value: 42 });
  });
  it("rejects zero, negatives, decimals and overflow", () => {
    for (const v of ["0", "-1", "1.5", "abc", "", "1000000000"]) expect(parsePrNumber(v).ok).toBe(false);
  });
});

describe("pull request links", () => {
  it("splits a full link into repo and number", () => {
    expect(parsePullRequestLink("https://github.com/vercel/next.js/pull/61234/files")).toEqual({
      repoUrl: "https://github.com/vercel/next.js",
      pr: "61234",
    });
    expect(parsePullRequestLink("https://github.com/vercel/next.js")).toBeNull();
  });
  it("round-trips claim keys", () => {
    const key = claimKeyOf("vercel", "next.js", 7);
    expect(key).toBe("vercel/next.js#7");
    expect(splitClaimKey(key)).toEqual({ owner: "vercel", repo: "next.js", pr: 7 });
    expect(pullRequestUrl(key)).toBe("https://github.com/vercel/next.js/pull/7");
  });
});

import { evaluateBio, evaluatePr } from "./preview";

describe("preview checks mirror the contract", () => {
  it("accepts a merged PR by the claimed user, any case", () => {
    expect(evaluatePr({ merged: true, merged_at: "2026-01-01T00:00:00Z", user: { login: "Octocat" } }, "octocat").status).toBe("MERGED_BY_AUTHOR");
  });
  it("rejects unmerged or someone else's PR", () => {
    expect(evaluatePr({ merged: false, user: { login: "octocat" } }, "octocat").status).toBe("NOT_MERGED_OR_WRONG_AUTHOR");
    expect(evaluatePr({ merged: true, user: { login: "other" } }, "octocat").status).toBe("NOT_MERGED_OR_WRONG_AUTHOR");
  });
  it("finds the address in a bio, ignoring case", () => {
    expect(evaluateBio({ login: "a", bio: "hi 0xABCDEF" }, "0xabcdef").status).toBe("ADDRESS_FOUND");
    expect(evaluateBio({ login: "a", bio: "hello" }, "0xabcdef").status).toBe("ADDRESS_NOT_FOUND");
    expect(evaluateBio({ login: "a", bio: null }, "0xabcdef").status).toBe("ADDRESS_NOT_FOUND");
  });
});
