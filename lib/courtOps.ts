import { doc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "./firebase";
import { Court } from "@/types";
import { addPlayerToQueue } from "./queue";

export async function assignPlayerToCourt(
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

export async function removePlayerFromCourt(
  court: Court,
  team: "A" | "B",
  playerId: string
): Promise<void> {
  const field = team === "A" ? "teamA" : "teamB";

  await Promise.all([
    updateDoc(doc(db, "courts", court.id), { [field]: arrayRemove(playerId) }),
    addPlayerToQueue(playerId),
  ]);
}

/**
 * 게임 종료 처리
 */
export async function finishGame(
  court: Court,
  winner: "A" | "B"
): Promise<void> {
  const loser = winner === "A" ? "B" : "A";

  const winnerPlayers = winner === "A" ? court.teamA : court.teamB;
  const loserPlayers = loser === "A" ? court.teamA : court.teamB;

  // 패배팀 → 대기열
  for (const p of loserPlayers) {
    await addPlayerToQueue(p);
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