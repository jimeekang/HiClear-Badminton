import type { Court, Player } from "@/types";

export type MatchConflictReason = "partner" | "opponent" | null;

export function checkAssignmentConflict(
  player: Player | undefined,
  sameTeamIds: string[],
  opponentTeamIds: string[]
): MatchConflictReason {
  if (!player) return null;

  const partnerIds = new Set([
    ...(player.partnerIds ?? []),
    ...(player.lastPartnerIds ?? []),
  ]);
  const opponentIds = new Set(player.opponentIds ?? []);

  if (sameTeamIds.some((id) => partnerIds.has(id))) return "partner";
  if (opponentTeamIds.some((id) => opponentIds.has(id))) return "opponent";
  return null;
}

export function getTeamIds(court: Court, team: "A" | "B"): string[] {
  return team === "A" ? court.teamA : court.teamB;
}

export function getOpponentTeamIds(court: Court, team: "A" | "B"): string[] {
  return team === "A" ? court.teamB : court.teamA;
}

export function canJoinTeam(
  player: Player | undefined,
  court: Court,
  team: "A" | "B",
  plannedSameTeamIds: string[] = [],
  plannedOpponentTeamIds: string[] = []
): boolean {
  return checkAssignmentConflict(
    player,
    [...getTeamIds(court, team), ...plannedSameTeamIds],
    [...getOpponentTeamIds(court, team), ...plannedOpponentTeamIds]
  ) === null;
}
