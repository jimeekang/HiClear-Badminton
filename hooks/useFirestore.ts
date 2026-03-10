"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, ensureAuthReady } from "@/lib/firebase";
import { Player, QueueEntry, Court } from "@/types";

export function usePlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      await ensureAuthReady();
      if (cancelled) return;
      // 이름 오름차순 정렬
      const q = query(collection(db, "players"), orderBy("name"));
      unsub = onSnapshot(
        q,
        (snap) => {
          setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player)));
        },
        (err) => console.error("players 리스너 오류:", err)
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);
  return players;
}

export function useQueue() {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      await ensureAuthReady();
      if (cancelled) return;
      const q = query(collection(db, "queue"), orderBy("position"));
      unsub = onSnapshot(
        q,
        (snap) => {
          setQueue(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QueueEntry)));
        },
        (err) => console.error("queue 리스너 오류:", err)
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);
  return queue;
}

export function useCourts() {
  const [courts, setCourts] = useState<Court[]>([]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      await ensureAuthReady();
      if (cancelled) return;
      // 이름 기준 정렬 (코트 1, 코트 2, 코트 A ...)
      const q = query(collection(db, "courts"), orderBy("name"));
      unsub = onSnapshot(
        q,
        (snap) => {
          setCourts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Court)));
        },
        (err) => console.error("courts 리스너 오류:", err)
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);
  return courts;
}
