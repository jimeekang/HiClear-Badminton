import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  where,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Player, Court } from "@/types";

// ─── Players ───
export async function addPlayer(name: string, gender: "M" | "F"): Promise<string> {
  const ref = await addDoc(collection(db, "players"), {
    name,
    gender,
    gamesPlayed: 0,
    lastPartnerIds: [],
    partnerIds: [],
    opponentIds: [],
  });
  return ref.id;
}

export async function getPlayers(): Promise<Player[]> {
  const snap = await getDocs(query(collection(db, "players"), orderBy("name")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
}

export async function updatePlayerGender(id: string, gender: "M" | "F"): Promise<void> {
  await updateDoc(doc(db, "players", id), { gender });
}

export async function deletePlayer(id: string): Promise<void> {
  const batch = writeBatch(db);

  // 1. 대기열에서 해당 선수의 entry 삭제
  const qSnap = await getDocs(
    query(collection(db, "queue"), where("playerId", "==", id))
  );
  qSnap.docs.forEach((d) => batch.delete(d.ref));

  // 2. 코트 teamA/teamB 에서 해당 선수 제거
  const cSnap = await getDocs(collection(db, "courts"));
  cSnap.docs.forEach((d) => {
    const data = d.data();
    const newTeamA = (data.teamA as string[]).filter((pid) => pid !== id);
    const newTeamB = (data.teamB as string[]).filter((pid) => pid !== id);
    if (newTeamA.length !== data.teamA.length || newTeamB.length !== data.teamB.length) {
      batch.update(d.ref, { teamA: newTeamA, teamB: newTeamB });
    }
  });

  // 3. 선수 문서 삭제
  batch.delete(doc(db, "players", id));

  await batch.commit();
}

// ─── Courts ───
export async function getCourts(): Promise<Court[]> {
  const snap = await getDocs(collection(db, "courts"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Court));
}

export async function addCourt(name: string): Promise<string> {
  const ref = await addDoc(collection(db, "courts"), {
    name,
    teamA: [],
    teamB: [],
    gamesA: 0,
    gamesB: 0,
    order: Date.now(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCourt(id: string, data: Partial<Court>): Promise<void> {
  await updateDoc(doc(db, "courts", id), data as Record<string, unknown>);
}

export async function deleteCourt(id: string): Promise<void> {
  await deleteDoc(doc(db, "courts", id));
}

export async function resetAllPartnerIds(): Promise<void> {
  const snap = await getDocs(collection(db, "players"));
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) =>
    batch.update(d.ref, {
      lastPartnerIds: [],
      partnerIds: [],
      opponentIds: [],
    })
  );
  await batch.commit();
}
