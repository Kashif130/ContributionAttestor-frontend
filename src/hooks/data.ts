import {
  getAttestation,
  getBlacklistStatus,
  getExpectedBioProof,
  getRewardPool,
  getReputation,
  listClaimsForAddress,
  listLeaderboard,
} from "../lib/client";
import { usePolled } from "./usePolled";

export const useRewardPool = () => usePolled(() => getRewardPool(), [], 30_000);

export const useLeaderboard = () => usePolled(() => listLeaderboard(), [], 45_000);

export const useReputation = (address: string | null) =>
  usePolled(() => getReputation(address as string), [address], 20_000, !!address);

export const useBlacklistStatus = (address: string | null) =>
  usePolled(() => getBlacklistStatus(address as string), [address], 30_000, !!address);

export const useVerifiedClaims = (address: string | null) =>
  usePolled(() => listClaimsForAddress(address as string), [address], 30_000, !!address);

export const useBioProof = (address: string | null) =>
  usePolled(() => getExpectedBioProof(address as string), [address], 600_000, !!address);

/** One claim by one wallet. `repoUrl`/`pr` must already be validated; pass null to stay idle. */
export const useAttestation = (repoUrl: string | null, pr: number | null, address: string | null) =>
  usePolled(() => getAttestation(repoUrl as string, pr as number, address as string), [repoUrl, pr, address], 10_000, !!repoUrl && pr !== null && !!address);
