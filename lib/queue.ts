import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { QueueEntry } from "@/types";

// Date.now()를 position으로 사용 → getMaxPosition() 쿼리 불필요
export async function addPlayerToQueue(playerId: string): Promise<void> {
  await addDoc(collection(db, "queue"), {
    playerId,
    position: Date.now(),
    joinedAt: serverTimestamp(),
  });
}

export async function pushTeamToQueue(playerIds: string[]): Promise<void> {
  const base = Date.now();
  const batch = writeBatch(db);
  playerIds.forEach((playerId, i) => {
    const ref = doc(collection(db, "queue"));
    batch.set(ref, { playerId, position: base + i, joinedAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function getNextPlayersFromQueue(count: number): Promise<QueueEntry[]> {
  const q = query(collection(db, "queue"), orderBy("position"));
  const snap = await getDocs(q);
  return snap.docs.slice(0, count).map((d) => ({ id: d.id, ...d.data() } as QueueEntry));
}

export async function removePlayersFromQueue(entryIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  for (const id of entryIds) {
    batch.delete(doc(db, "queue", id));
  }
  await batch.commit();
}

export async function clearQueue(): Promise<void> {
  const snap = await getDocs(collection(db, "queue"));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
