import { collection, doc, writeBatch, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import { Court, QueueEntry } from "@/types";

export interface AppSnapshot {
  courts: Array<{
    id: string;
    name: string;
    teamA: string[];
    teamB: string[];
    gamesA: number;
    gamesB: number;
  }>;
  queue: Array<{
    playerId: string;
    position: number;
  }>;
}

export function captureSnapshot(courts: Court[], queue: QueueEntry[]): AppSnapshot {
  return {
    courts: courts.map((c) => ({
      id: c.id,
      name: c.name,
      teamA: [...c.teamA],
      teamB: [...c.teamB],
      gamesA: c.gamesA ?? 0,
      gamesB: c.gamesB ?? 0,
    })),
    queue: queue.map((q) => ({ playerId: q.playerId, position: q.position })),
  };
}

export async function restoreSnapshot(
  snapshot: AppSnapshot,
  currentCourts: Court[]
): Promise<void> {
  const batch = writeBatch(db);

  const snapshotIds = new Set(snapshot.courts.map((c) => c.id));
  const currentIds = new Set(currentCourts.map((c) => c.id));

  for (const court of snapshot.courts) {
    batch.set(doc(db, "courts", court.id), {
      name: court.name,
      teamA: court.teamA,
      teamB: court.teamB,
      gamesA: court.gamesA,
      gamesB: court.gamesB,
      active: true,
    });
  }

  for (const id of currentIds) {
    if (!snapshotIds.has(id)) batch.delete(doc(db, "courts", id));
  }

  const queueSnap = await getDocs(collection(db, "queue"));
  queueSnap.docs.forEach((d) => batch.delete(d.ref));

  snapshot.queue.forEach((q) => {
    batch.set(doc(collection(db, "queue")), {
      playerId: q.playerId,
      position: q.position,
      joinedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

export async function sendAllCourtsToQueue(courts: Court[]): Promise<void> {
  const allPlayerIds = courts.flatMap((c) => [...c.teamA, ...c.teamB]);
  if (allPlayerIds.length === 0) return;

  const batch = writeBatch(db);
  const base = Date.now();

  allPlayerIds.forEach((playerId, i) => {
    batch.set(doc(collection(db, "queue")), {
      playerId,
      position: base + i,
      joinedAt: serverTimestamp(),
    });
  });

  courts.forEach((court) => {
    if (court.teamA.length > 0 || court.teamB.length > 0) {
      batch.update(doc(db, "courts", court.id), {
        teamA: [],
        teamB: [],
        gamesA: 0,
        gamesB: 0,
      });
    }
  });

  await batch.commit();
}
