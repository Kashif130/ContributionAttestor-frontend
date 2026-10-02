# Contribution Attestor frontend

A React frontend for the `ContributionAttestor` GenLayer contract. A wallet claims "I wrote this merged GitHub pull request",
validators check GitHub's public API, and the wallet's verified count goes up. Built on the same wallet and network code as the
Quest Verifier frontend.

Vite + React + TypeScript + Tailwind, talking to the chain through `genlayer-js`. No backend.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Overview, a wallet look-up box, an example result, the top wallets |
| `/claim` | Three steps: put the proof text in your GitHub bio, register the claim, run the check. Shows both checks and the outcome |
| `/registry` | Every verified wallet, most first, plus "who verified this pull request?" |
| `/profile/:address` | One wallet's count and verified pull requests (`/profile` uses the connected wallet) |
| `/keepers` | Fund the reward pool, or run the check for someone else's claim |
| `/admin` | Blacklist or reinstate a wallet (the contract only accepts the deploying wallet) |

Input rules (GitHub username, github.com repository link, pull request number) mirror the contract's, so mistakes are caught
before any gas is spent. Pasting a full pull request link fills the repository and number together.

## Setup

1. Deploy `contracts/ContributionAttestor.py` (included in this repo) on StudioNet (the deploying wallet becomes admin) and copy the address.
2. `cp .env.example .env` and set `VITE_CONTRACT_ADDRESS` (and `VITE_GENLAYER_NETWORK` if not Studio).
3. `npm install && npm run dev`.
4. Vercel: add the same variables, then redeploy. Vite bakes them in at build time.

The address can also be pasted in the app's network menu without a rebuild.

## Repo layout

- `src/`: the frontend
- `contracts/ContributionAttestor.py`: the GenLayer contract
- `tests/direct/`: contract tests (`pip install -r requirements.txt && pytest -v`)
- `CONTRACT.md`: the contract's own README (methods, limitations)

## Checks

```
npm run typecheck
npm test
npm run build
```

`npm test` covers the input rules in `src/lib/github.ts`.
