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
import { runFirestoreSessionMutationWithScope } from "./firestoreSessionReset";
import type { SessionMutationScope } from "./sessionReset";
import { QueueEntry } from "@/types";

// Date.now()를 position으로 사용 → getMaxPosition() 쿼리 불필요
export function addPlayerToQueue(
  playerId: string,
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, async () => {
    await addDoc(collection(db, "queue"), {
      playerId,
      position: Date.now(),
      joinedAt: serverTimestamp(),
    });
  });
}

export function pushTeamToQueue(
  playerIds: string[],
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, async () => {
    const base = Date.now();
    const batch = writeBatch(db);
    playerIds.forEach((playerId, i) => {
      const ref = doc(collection(db, "queue"));
      batch.set(ref, { playerId, position: base + i, joinedAt: serverTimestamp() });
    });
    await batch.commit();
  });
}

export async function getNextPlayersFromQueue(count: number): Promise<QueueEntry[]> {
  const q = query(collection(db, "queue"), orderBy("position"));
  const snap = await getDocs(q);
  return snap.docs.slice(0, count).map((d) => ({ id: d.id, ...d.data() } as QueueEntry));
}

export function removePlayersFromQueue(
  entryIds: string[],
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, async () => {
    const batch = writeBatch(db);
    for (const id of entryIds) {
      batch.delete(doc(db, "queue", id));
    }
    await batch.commit();
  });
}

export function reorderQueueEntries(
  entries: readonly Pick<QueueEntry, "id">[],
  scope?: SessionMutationScope
): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, async () => {
    const batch = writeBatch(db);
    entries.forEach((entry, index) => {
      batch.update(doc(db, "queue", entry.id), { position: index + 1 });
    });
    await batch.commit();
  });
}

export function clearQueue(scope?: SessionMutationScope): Promise<void> | null {
  return runFirestoreSessionMutationWithScope(scope, async () => {
    const snap = await getDocs(collection(db, "queue"));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  });
}
