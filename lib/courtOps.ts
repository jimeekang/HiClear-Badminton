import { doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { Court } from "@/types";
import { addPlayerToQueue, pushTeamToQueue } from "./queue";
import { runFirestoreSessionMutationWithScope } from "./firestoreSessionReset";
import type { SessionMutationScope } from "./sessionReset";

export function assignPlayerToCourt(
  court: Court,
  team: "A" | "B",
  playerId: string,
  queueEntryId: string,
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, () =>
    assignPlayerToCourtWrite(court, team, playerId, queueEntryId)
  );
}

async function assignPlayerToCourtWrite(
  court: Court,
  team: "A" | "B",
  playerId: string,
  queueEntryId: string
): Promise<void> {
  const field = team === "A" ? "teamA" : "teamB";

  await Promise.all([
    updateDoc(doc(db, "courts", court.id), { [field]: arrayUnion(playerId) }),
    deleteDoc(doc(db, "queue", queueEntryId)),
  ]);
}

export function removePlayerFromCourt(
  court: Court,
  team: "A" | "B",
  playerId: string,
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, (activeScope) =>
    removePlayerFromCourtWrite(court, team, playerId, activeScope)
  );
}

async function removePlayerFromCourtWrite(
  court: Court,
  team: "A" | "B",
  playerId: string,
  scope: SessionMutationScope
): Promise<void> {
  const field = team === "A" ? "teamA" : "teamB";

  await Promise.all([
    updateDoc(doc(db, "courts", court.id), { [field]: arrayRemove(playerId) }),
    addPlayerToQueue(playerId, scope),
  ]);
}

export function sendCourtPlayersToQueue(
  court: Court,
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, (activeScope) =>
    sendCourtPlayersToQueueWrite(court, activeScope)
  );
}

async function sendCourtPlayersToQueueWrite(
  court: Court,
  scope: SessionMutationScope
): Promise<void> {
  const all = [...court.teamA, ...court.teamB];
  if (all.length === 0) return;
  await Promise.all([
    pushTeamToQueue(all, scope),
    updateDoc(doc(db, "courts", court.id), { teamA: [], teamB: [], gamesA: 0, gamesB: 0 }),
  ]);
}

export function deleteCourtAndQueuePlayers(
  court: Court,
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, async (activeScope) => {
    const all = [...court.teamA, ...court.teamB];
    if (all.length > 0) await pushTeamToQueue(all, activeScope);
    await deleteDoc(doc(db, "courts", court.id));
  });
}

export function reorderCourts(
  courts: readonly Pick<Court, "id">[],
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, async () => {
    const batch = writeBatch(db);
    courts.forEach((court, index) => {
      batch.update(doc(db, "courts", court.id), { order: index });
    });
    await batch.commit();
  });
}

/**
 * 게임 종료 처리
 */
export function finishGame(
  court: Court,
  winner: "A" | "B",
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, (activeScope) =>
    finishGameWrite(court, winner, activeScope)
  );
}

async function finishGameWrite(
  court: Court,
  winner: "A" | "B",
  scope: SessionMutationScope
): Promise<void> {
  const loser = winner === "A" ? "B" : "A";

  const winnerPlayers = winner === "A" ? court.teamA : court.teamB;
  const loserPlayers = loser === "A" ? court.teamA : court.teamB;

  // 패배팀 → 대기열
  for (const p of loserPlayers) {
    await addPlayerToQueue(p, scope);
  }

  // 코트 gamesA/gamesB 갱신
  const gamesA = court.gamesA ?? 0;
  const gamesB = court.gamesB ?? 0;

  await updateDoc(doc(db, "courts", court.id), {
    teamA: winner === "A" ? winnerPlayers : [],
    teamB: winner === "B" ? winnerPlayers : [],
    gamesA: winner === "A" ? gamesA + 1 : 0,
    gamesB: winner === "B" ? gamesB + 1 : 0,
  });
}
