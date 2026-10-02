# ContributionAttestor

A permissionless, on-chain proof-of-contribution registry built as a GenLayer Intelligent
Contract. A wallet claims "I authored this merged GitHub pull request," and GenLayer's consensus
verifies two purely **objective** facts straight from GitHub's own public REST API before any
reputation is recorded — no subjective judgment call is ever left to the model.

v2 of this contract deliberately ports several features from this ecosystem's steward-approved
`ReputationAttestor` — a reward pool for keeper-triggered verification, an admin-scoped blacklist,
and pagination — after comparing the two contracts directly. See the header comment in
`contracts/ContributionAttestor.py` for the full rationale behind each, including the one place a
naive port would have introduced a new griefing vector and how that was avoided.

## How it works

1. **Register.** Call `register_claim(github_username, repo_url, pr_number, note)` from the wallet
   you want the attestation tied to. Self-sovereign — only you can register a claim for your own
   address, and only you ever declare which GitHub username you're claiming to be.
2. **Verify.** Anyone — you, or a third-party keeper — can call
   `verify_contribution(claimant, repo_url, pr_number)` to trigger the actual consensus check. It
   re-checks **your own already-registered username**, never anything the calling keeper supplies,
   so a keeper controls *when* a check runs but never *what* gets checked. The check fetches:
   - `GET api.github.com/repos/{owner}/{repo}/pulls/{pr_number}` — was it merged, and by whom?
   - `GET api.github.com/users/{github_username}` — does the bio contain your wallet address?
3. **Lock or retry.** If both checks pass, the claim becomes `VERIFIED` and is permanently locked
   to your address; your on-chain reputation counter increments by one, and whoever triggered the
   successful check earns a keeper reward from the reward pool, if it's funded. If either check
   fails, the claim is `REJECTED` with a visible reason, and you (or a keeper) can retry after a
   cooldown — most commonly after you've added your address to your bio.

The model is only ever asked to extract two structured facts from JSON it's handed — the
contract's own code decides `VERIFIED` vs `REJECTED` from those facts with a strict `AND`, never
trusting a single holistic verdict from the model.

## Methods

| Method | Type | Description |
|---|---|---|
| `register_claim(github_username, repo_url, pr_number, note)` | write | Self-sovereign: declare your own claim. Can be re-called to correct a typo before it's ever checked. |
| `verify_contribution(claimant, repo_url, pr_number)` | write, permissionless | Triggers the consensus check for an already-registered claim. Cooldown-gated on retry. |
| `fund_rewards()` | write, payable, permissionless | Adds to the keeper reward pool. |
| `blacklist_address(target, reason)` / `unblacklist_address(target)` | write, admin-only | Narrow, disclosed exception to "no admin" — see header comment. |
| `get_attestation(repo_url, pr_number, address)` | view | Full record for one claim, or `{}`. |
| `get_verified_owner(repo_url, pr_number)` | view | The address a claim is locked to, or `""`. |
| `get_reputation(address)` | view | Count of that address's `VERIFIED` attestations (`0` if blacklisted). |
| `get_blacklist_status(address)` | view | `{blacklisted, reason}`. |
| `get_expected_bio_proof(address)` | view | The exact string to put in a GitHub bio. |
| `get_reward_pool()` | view | Current pool balance, in wei, as a string. |
| `list_claims_for_address(address)` | view | Every claim that address has verified. |
| `list_verified_addresses(offset, limit)` | view | Paginated enumeration of every address with ≥1 verified attestation. |

## Deploy

1. Open [studio.genlayer.com](https://studio.genlayer.com), create a new contract, paste in
   `contracts/ContributionAttestor.py`, deploy on StudioNet. The deploying address becomes `admin`.
2. Note the deployed contract address.

## Test

```bash
pip install -r requirements.txt
pytest -v
```

42 tests. The pure input-validation, locking, and cooldown tests are fully hermetic — no network
access, no LLM calls. The consensus-outcome tests use `direct_vm.mock_web` / `direct_vm.mock_llm`
(the same pattern ProofOfLifeVault's own test suite uses) to pin exact `VERIFIED` / `REJECTED`
outcomes deterministically, without depending on any real GitHub account's real state.

## Honest limitations

- The bio-address check proves control of a GitHub account **at the moment of the check** — not a
  continuously-revalidated, live identity link.
- No defense against a maintainer merging someone else's patch under their own account — this
  contract attests "this GitHub identity authored this merged PR, and this wallet controls that
  identity," nothing stronger.
- GitHub's unauthenticated API rate limits are real; a burst of checks may see transient
  `FETCH_UNAVAILABLE` results. Retry after the cooldown.
- Reputation is a **count** of independently verified merged PRs under a proven-controlled
  identity — not a quality, seniority, or significance score.
- The admin can blacklist/unblacklist. That is real, disclosed, centralized power over whose
  reputation reads as valid — narrower than an admin who can mint reputation or drain funds, but
  power nonetheless.

## Manually testing the VERIFIED path end to end

The automated suite cannot prove a real `VERIFIED` outcome against live GitHub data, because that
would require a real GitHub account whose real bio contains a specific test wallet's address —
nobody has pre-arranged that for an automated CI run. To see the real path work:

1. Pick any of your own **merged** pull requests on a public GitHub repo.
2. Call `get_expected_bio_proof(your_address)` and add the result anywhere in your GitHub profile
   bio.
3. Call `register_claim(your_github_username, repo_url, pr_number, "testing")` from that wallet.
4. Call `verify_contribution(your_address, repo_url, pr_number)` — from the same wallet, or any
   other.
5. Check `get_attestation(repo_url, pr_number, your_address)` — it should show `VERIFIED`.
