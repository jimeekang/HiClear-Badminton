import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import {
  runCoordinatedSessionReset,
  resetSession,
  runSessionMutation,
  type SessionMutationScope,
  type SessionResetStore,
} from "./sessionReset";

const firestoreSessionResetStore: SessionResetStore = {
  async loadTargets() {
    const [queueSnapshot, courtSnapshot, playerSnapshot] = await Promise.all([
      getDocs(collection(db, "queue")),
      getDocs(collection(db, "courts")),
      getDocs(collection(db, "players")),
    ]);

    return {
      queueEntryIds: queueSnapshot.docs.map((entry) => entry.id),
      courtIds: courtSnapshot.docs.map((court) => court.id),
      playerIds: playerSnapshot.docs.map((player) => player.id),
    };
  },

  async commit(plan) {
    const batch = writeBatch(db);
    plan.queueEntryIds.forEach((id) => batch.delete(doc(db, "queue", id)));
    plan.courts.forEach(({ id, data }) => batch.update(doc(db, "courts", id), data));
    plan.players.forEach(({ id, data }) => batch.update(doc(db, "players", id), data));
    await batch.commit();
  },
};

const sessionOperationState = {
  current: null as Promise<void> | null,
  resetPending: false,
  resetting: false,
  activeMutations: new Set<Promise<unknown>>(),
};

export function runFirestoreSessionMutation<T>(
  mutation: (scope: SessionMutationScope) => Promise<T>
): Promise<T> | null {
  return runSessionMutation(sessionOperationState, mutation);
}

export function runFirestoreSessionMutationWithScope<T>(
  scope: SessionMutationScope | undefined,
  mutation: (scope: SessionMutationScope) => Promise<T>
): Promise<T> | null {
  return scope
    ? scope.follow(() => mutation(scope))
    : runFirestoreSessionMutation(mutation);
}

export function resetFirestoreSession(): Promise<void> {
  return runCoordinatedSessionReset(
    sessionOperationState,
    () => resetSession(firestoreSessionResetStore)
  );
}
