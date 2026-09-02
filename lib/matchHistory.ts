import type { Court, Player } from "@/types";

export type MatchConflictReason = "partner" | "opponent" | null;
export type PartnerResetReason = "required-gender-missing" | "match-history-exhausted" | null;

export interface AutoFillQueueEntry {
  id: string;
  playerId: string;
}

export interface AutoFillAssignment {
  courtId: string;
  team: "A" | "B";
  playerId: string;
  entryId: string;
}

export interface AutoFillPlan {
  assignments: AutoFillAssignment[];
  totalSlots: number;
  needsHistoryReset: boolean;
}

export interface MatchHistoryResetState {
  current: Promise<void> | null;
}

export interface MatchHistoryOperationGate {
  resetRequests: number;
  activeGameResults: number;
}

export function tryBeginMatchHistoryReset(gate: MatchHistoryOperationGate): boolean {
  if (gate.activeGameResults > 0) return false;
  gate.resetRequests += 1;
  return true;
}

export function finishMatchHistoryReset(gate: MatchHistoryOperationGate): void {
  gate.resetRequests = Math.max(0, gate.resetRequests - 1);
}

export function tryBeginGameResult(gate: MatchHistoryOperationGate): boolean {
  if (gate.resetRequests > 0) return false;
  gate.activeGameResults += 1;
  return true;
}

export function finishGameResult(gate: MatchHistoryOperationGate): void {
  gate.activeGameResults = Math.max(0, gate.activeGameResults - 1);
}

export interface PlayerMatchHistorySnapshot {
  id: string;
  lastPartnerIds: string[];
  partnerIds: string[];
  opponentIds: string[];
}

export function capturePlayerMatchHistories(players: Player[]): PlayerMatchHistorySnapshot[] {
  return players.map((player) => ({
    id: player.id,
    lastPartnerIds: [...(player.lastPartnerIds ?? [])],
    partnerIds: [...(player.partnerIds ?? [])],
    opponentIds: [...(player.opponentIds ?? [])],
  }));
}

export function runMatchHistoryResetSingleFlight(
  state: MatchHistoryResetState,
  reset: () => Promise<void>
): Promise<void> {
  if (state.current) return state.current;

  const request = reset();
  state.current = request;
  void request.then(
    () => { if (state.current === request) state.current = null; },
    () => { if (state.current === request) state.current = null; }
  );
  return request;
}

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
  players: Player[],
  plannedSameTeamIds: string[] = [],
  plannedOpponentTeamIds: string[] = []
): boolean {
  if (!player) return false;

  const sameTeamIds = [...getTeamIds(court, team), ...plannedSameTeamIds];
  if (sameTeamIds.length >= 2) return false;

  if (sameTeamIds.length === 1) {
    const partner = players.find((candidate) => candidate.id === sameTeamIds[0]);
    if (!partner) return false;
    if (partner.gender === player.gender) return false;
  }

  return checkAssignmentConflict(
    player,
    sameTeamIds,
    [...getOpponentTeamIds(court, team), ...plannedOpponentTeamIds]
  ) === null;
}

export function getPartnerResetReason(
  candidates: Player[],
  court: Court,
  team: "A" | "B",
  players: Player[]
): PartnerResetReason {
  const teamIds = getTeamIds(court, team);
  if (teamIds.length >= 2) return null;

  if (teamIds.length === 0) {
    if (candidates.length === 0) return null;
    return candidates.some((candidate) => canJoinTeam(candidate, court, team, players))
      ? null
      : "match-history-exhausted";
  }

  const partner = players.find((player) => player.id === teamIds[0]);
  if (!partner) return null;

  const requiredGender = partner.gender === "M" ? "F" : "M";
  const requiredCandidates = candidates.filter((candidate) => candidate.gender === requiredGender);
  if (requiredCandidates.length === 0) return "required-gender-missing";
  return requiredCandidates.some((candidate) => canJoinTeam(candidate, court, team, players))
    ? null
    : "match-history-exhausted";
}

export function planAutoFill(
  courts: Court[],
  queue: Record<"M" | "F", AutoFillQueueEntry[]>,
  players: Player[]
): AutoFillPlan {
  const assignments: AutoFillAssignment[] = [];
  const usedIds = new Set<string>();
  const playerById = new Map(players.map((player) => [player.id, player]));
  let totalSlots = 0;
  let needsHistoryReset = false;

  for (const court of courts) {
    for (const team of ["A", "B"] as const) {
      const teamPlayers = getTeamIds(court, team);
      if (teamPlayers.length >= 2) continue;

      const emptyCount = 2 - teamPlayers.length;
      const existingGenders = teamPlayers.map((id) => playerById.get(id)?.gender);
      const toFill: ("M" | "F")[] =
        emptyCount === 2 ? ["M", "F"] : [existingGenders.includes("M") ? "F" : "M"];
      totalSlots += toFill.length;

      if (emptyCount === 2) {
        const plannedOpponentTeamIds = assignments
          .filter((assignment) => assignment.courtId === court.id && assignment.team !== team)
          .map((assignment) => assignment.playerId);
        let pair: { male: AutoFillQueueEntry; female: AutoFillQueueEntry } | null = null;

        for (const maleEntry of queue.M) {
          if (usedIds.has(maleEntry.playerId)) continue;
          const male = playerById.get(maleEntry.playerId);
          if (!canJoinTeam(male, court, team, players, [], plannedOpponentTeamIds)) continue;

          for (const femaleEntry of queue.F) {
            if (usedIds.has(femaleEntry.playerId)) continue;
            const female = playerById.get(femaleEntry.playerId);
            if (canJoinTeam(female, court, team, players, [maleEntry.playerId], plannedOpponentTeamIds)) {
              pair = { male: maleEntry, female: femaleEntry };
              break;
            }
          }

          if (pair) break;
        }

        if (pair) {
          assignments.push(
            { courtId: court.id, team, playerId: pair.male.playerId, entryId: pair.male.id },
            { courtId: court.id, team, playerId: pair.female.playerId, entryId: pair.female.id }
          );
          usedIds.add(pair.male.playerId);
          usedIds.add(pair.female.playerId);
          continue;
        }
      }

      for (const gender of toFill) {
        const plannedSameTeamIds = assignments
          .filter((assignment) => assignment.courtId === court.id && assignment.team === team)
          .map((assignment) => assignment.playerId);
        const plannedOpponentTeamIds = assignments
          .filter((assignment) => assignment.courtId === court.id && assignment.team !== team)
          .map((assignment) => assignment.playerId);

        for (const entry of queue[gender]) {
          if (usedIds.has(entry.playerId)) continue;
          const player = playerById.get(entry.playerId);
          if (!player) continue;

          if (canJoinTeam(player, court, team, players, plannedSameTeamIds, plannedOpponentTeamIds)) {
            assignments.push({
              courtId: court.id,
              team,
              playerId: entry.playerId,
              entryId: entry.id,
            });
            usedIds.add(entry.playerId);
            break;
          }
        }
      }

      const plannedCourt: Court = {
        ...court,
        teamA: [
          ...court.teamA,
          ...assignments
            .filter((assignment) => assignment.courtId === court.id && assignment.team === "A")
            .map((assignment) => assignment.playerId),
        ],
        teamB: [
          ...court.teamB,
          ...assignments
            .filter((assignment) => assignment.courtId === court.id && assignment.team === "B")
            .map((assignment) => assignment.playerId),
        ],
      };
      const remainingCandidates = [...queue.M, ...queue.F]
        .filter((entry) => !usedIds.has(entry.playerId))
        .map((entry) => playerById.get(entry.playerId))
        .filter((player): player is Player => Boolean(player));

      if (getPartnerResetReason(remainingCandidates, plannedCourt, team, players)) {
        needsHistoryReset = true;
      }
    }
  }

  return { assignments, totalSlots, needsHistoryReset };
}
