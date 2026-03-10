import { doc, collection, writeBatch, increment, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { Court, QueueEntry } from "@/types";

/**
 * 승자 잔류 / 패자 큐, 코트 gamesA/gamesB 업데이트
 *
 * 예시:
 * A vs B, A 승 → A stays, B → queue, gamesA = 1
 * A vs C, A 패 → A → queue, C stays, gamesB = 1
 */
export async function processGameResult(
  court: Court,
  winner: "A" | "B",
  _queue: QueueEntry[]
): Promise<void> {
  const loserTeam = winner === "A" ? court.teamB : court.teamA;
  const winnerTeam = winner === "A" ? court.teamA : court.teamB;
  const allPlayers = [...court.teamA, ...court.teamB];

  const winnerPrevStreak = winner === "A" ? (court.gamesA ?? 0) : (court.gamesB ?? 0);
  // 승자가 이미 1게임 이상 연속으로 했으면 2번째 연속 → 대기열로 보냄
  const winnerAlsoLeaves = winnerPrevStreak >= 1;

  const batch = writeBatch(db);
  const basePosition = Date.now();

  if (winnerAlsoLeaves) {
    // 2연속 승리: 승자만 대기열, 패자는 코트에 잔류
    winnerTeam.forEach((pid, i) => {
      const ref = doc(collection(db, "queue"));
      batch.set(ref, {
        playerId: pid,
        position: basePosition + i,
        joinedAt: serverTimestamp(),
      });
    });
  } else {
    // 일반 게임: 패자만 대기열
    loserTeam.forEach((pid, i) => {
      const ref = doc(collection(db, "queue"));
      batch.set(ref, {
        playerId: pid,
        position: basePosition + i,
        joinedAt: serverTimestamp(),
      });
    });
  }

  // 각 선수 gamesPlayed +1
  allPlayers.forEach((pid) => {
    batch.update(doc(db, "players", pid), { gamesPlayed: increment(1) });
  });

  // 2연속 승리: 패자 잔류(streak=1), 승자 자리 비움
  // 일반 게임: 승자 잔류(streak++), 패자 자리 비움
  const loser = winner === "A" ? "B" : "A";
  batch.update(doc(db, "courts", court.id), {
    teamA: winnerAlsoLeaves
      ? (loser === "A" ? loserTeam : [])
      : (winner === "A" ? winnerTeam : []),
    teamB: winnerAlsoLeaves
      ? (loser === "B" ? loserTeam : [])
      : (winner === "B" ? winnerTeam : []),
    gamesA: winnerAlsoLeaves
      ? (loser === "A" ? 1 : 0)
      : (winner === "A" ? winnerPrevStreak + 1 : 0),
    gamesB: winnerAlsoLeaves
      ? (loser === "B" ? 1 : 0)
      : (winner === "B" ? winnerPrevStreak + 1 : 0),
  });

  await batch.commit();
}
