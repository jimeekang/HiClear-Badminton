import { doc, collection, writeBatch, increment, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { Court, QueueEntry } from "@/types";

/**
 * 나오는팀(leaver) 기반 처리
 * - 일반: leaver → queue, stayer 잔류(streak++)
 * - 2연속: stayer → queue, leaver 코트 잔류(streak=1)
 */
export async function processGameResult(
  court: Court,
  leaver: "A" | "B",
  _queue: QueueEntry[]
): Promise<void> {
  const stayer = leaver === "A" ? "B" : "A";
  const leavingTeam = leaver === "A" ? court.teamA : court.teamB;
  const stayingTeam = leaver === "A" ? court.teamB : court.teamA;
  const allPlayers = [...court.teamA, ...court.teamB];

  const stayerPrevStreak = stayer === "A" ? (court.gamesA ?? 0) : (court.gamesB ?? 0);
  const stayerAlsoLeaves = stayerPrevStreak >= 1;

  const batch = writeBatch(db);
  const basePosition = Date.now();

  if (stayerAlsoLeaves) {
    // 2연속: stayer도 대기열, leaver는 코트 잔류
    stayingTeam.forEach((pid, i) => {
      const ref = doc(collection(db, "queue"));
      batch.set(ref, { playerId: pid, position: basePosition + i, joinedAt: serverTimestamp() });
    });
  } else {
    // 일반: leaver만 대기열
    leavingTeam.forEach((pid, i) => {
      const ref = doc(collection(db, "queue"));
      batch.set(ref, { playerId: pid, position: basePosition + i, joinedAt: serverTimestamp() });
    });
  }

  // gamesPlayed +1 & 같은 팀 파트너만 저장 (상대팀 제외)
  [court.teamA, court.teamB].forEach((team) => {
    team.forEach((pid, i) => {
      const partner = team[1 - i];
      batch.update(doc(db, "players", pid), {
        gamesPlayed: increment(1),
        lastPartnerIds: partner ? [partner] : [],
      });
    });
  });

  batch.update(doc(db, "courts", court.id), {
    teamA: stayerAlsoLeaves
      ? (leaver === "A" ? leavingTeam : [])
      : (stayer === "A" ? stayingTeam : []),
    teamB: stayerAlsoLeaves
      ? (leaver === "B" ? leavingTeam : [])
      : (stayer === "B" ? stayingTeam : []),
    gamesA: stayerAlsoLeaves
      ? (leaver === "A" ? 1 : 0)
      : (stayer === "A" ? stayerPrevStreak + 1 : 0),
    gamesB: stayerAlsoLeaves
      ? (leaver === "B" ? 1 : 0)
      : (stayer === "B" ? stayerPrevStreak + 1 : 0),
  });

  await batch.commit();
}
