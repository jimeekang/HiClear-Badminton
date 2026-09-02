"use client";
import { useRef } from "react";
import { useState } from "react";
import { usePlayers, useQueue, useCourts } from "@/hooks/useFirestore";
import { addPlayer, deletePlayer, updatePlayerGender } from "@/lib/db";
import { addPlayerToQueue, removePlayersFromQueue } from "@/lib/queue";
import {
  resetFirestoreSession,
  runFirestoreSessionMutation,
} from "@/lib/firestoreSessionReset";
import { hasSessionStateToReset } from "@/lib/sessionReset";

export default function PlayersPage() {
  const players = usePlayers();
  const queue = useQueue();
  const courts = useCourts();

  const [name, setName] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [autoQueue, setAutoQueue] = useState(true);
  const [search, setSearch] = useState("");
  const [addingToQueue, setAddingToQueue] = useState<Set<string>>(new Set());
  const [resettingSession, setResettingSession] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef(""); // 동기적 name 추적 (중복 방지용)
  const resettingSessionRef = useRef(false);

  const queuePlayerIds = new Set(queue.map((e) => e.playerId));
  const courtPlayerIds = new Set(courts.flatMap((c) => [...c.teamA, ...c.teamB]));
  const canResetSession = hasSessionStateToReset(queue, courts, players);

  const handleAdd = () => {
    if (resettingSessionRef.current) return;
    const trimmed = nameRef.current.trim();
    if (!trimmed) return; // nameRef가 이미 비었으면 중복 실행 방지

    const request = runFirestoreSessionMutation(async (scope) => {
      const id = await addPlayer(trimmed, gender);
      if (autoQueue) await addPlayerToQueue(id, scope);
    });
    if (!request) return;

    // 동기적으로 즉시 초기화 - Firebase 일절 기다리지 않음
    nameRef.current = "";
    setName("");
    inputRef.current?.focus();

    // Firebase는 완전 백그라운드 처리
    void request.catch((err) => {
      console.error("선수 등록 실패:", err);
      alert("선수 등록에 실패했습니다.\nFirebase 연결을 확인해주세요.");
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (resettingSessionRef.current) return;
    if (!confirm(`${name} 선수를 삭제하시겠습니까?\n(대기열 및 코트에서도 자동으로 제거됩니다)`)) return;
    const request = runFirestoreSessionMutation(() => deletePlayer(id));
    if (request) await request;
  };

  const handleResetSession = async () => {
    if (!canResetSession || resettingSessionRef.current) return;
    if (!confirm(
      "대기열과 모든 코트의 선수 배치, 모든 선수의 매칭 기록을 초기화하시겠습니까?\n선수 등록 정보와 코트는 유지됩니다."
    )) return;

    resettingSessionRef.current = true;
    setResettingSession(true);
    try {
      await resetFirestoreSession();
      alert("대기열, 코트 배치, 매칭 기록을 모두 초기화했습니다.");
    } catch (error) {
      console.error("전체 초기화 실패:", error);
      alert("전체 초기화에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      resettingSessionRef.current = false;
      setResettingSession(false);
    }
  };

  const handleToggleQueue = async (id: string) => {
    if (resettingSessionRef.current || addingToQueue.has(id)) return;
    const request = runFirestoreSessionMutation(async (scope) => {
      if (queuePlayerIds.has(id)) {
        const entry = queue.find((e) => e.playerId === id);
        if (entry) await removePlayersFromQueue([entry.id], scope);
      } else {
        await addPlayerToQueue(id, scope);
      }
    });
    if (!request) return;

    setAddingToQueue((prev) => new Set([...prev, id]));
    try {
      await request;
    } finally {
      setAddingToQueue((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleToggleGender = async (id: string, gender: "M" | "F") => {
    if (resettingSessionRef.current) return;
    const request = runFirestoreSessionMutation(() =>
      updatePlayerGender(id, gender === "M" ? "F" : "M")
    );
    if (request) await request;
  };

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-72px)]">
      {/* Left: Registration panel */}
      <div className="w-96 shrink-0 bg-white border-r border-gray-200 flex flex-col p-5 gap-4">
        <h2 className="text-2xl font-bold text-blue-900">선수 등록</h2>

        <input
          ref={inputRef}
          type="text"
          placeholder="이름 입력"
          value={name}
          disabled={resettingSession}
          onChange={(e) => { setName(e.target.value); nameRef.current = e.target.value; }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          autoFocus
          className="border-2 border-blue-200 rounded-xl px-4 text-2xl focus:outline-none focus:border-blue-600 bg-white disabled:opacity-40"
          style={{ height: 64 }}
        />

        <div className="flex gap-3">
          <button
            onClick={() => setGender("M")}
            disabled={resettingSession}
            className={`flex-1 rounded-xl text-2xl font-bold transition-colors disabled:opacity-40 ${
              gender === "M" ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-400 border-2 border-blue-200"
            }`}
            style={{ height: 64 }}
          >
            남 (M)
          </button>
          <button
            onClick={() => setGender("F")}
            disabled={resettingSession}
            className={`flex-1 rounded-xl text-2xl font-bold transition-colors disabled:opacity-40 ${
              gender === "F" ? "bg-pink-500 text-white" : "bg-pink-50 text-pink-400 border-2 border-pink-200"
            }`}
            style={{ height: 64 }}
          >
            여 (F)
          </button>
        </div>

        <button
          onClick={() => setAutoQueue((v) => !v)}
          disabled={resettingSession}
          className={`flex items-center gap-3 px-4 rounded-xl border-2 text-xl font-medium transition-colors disabled:opacity-40 ${
            autoQueue ? "border-blue-500 bg-blue-100 text-blue-800" : "border-blue-200 bg-white text-blue-400"
          }`}
          style={{ height: 56 }}
        >
          <span className={`w-6 h-6 rounded-md flex items-center justify-center text-white text-sm ${autoQueue ? "bg-blue-500" : "bg-gray-300"}`}>
            {autoQueue ? "✓" : ""}
          </span>
          등록 후 대기열 자동 추가
        </button>

        <button
          onClick={handleAdd}
          disabled={!name.trim() || resettingSession}
          className="bg-blue-500 text-white rounded-xl text-2xl font-bold disabled:opacity-40 hover:bg-blue-600 transition-colors"
          style={{ height: 80 }}
        >
          등록
        </button>

        <p className="text-sm text-gray-400 text-center">Enter 키로 연속 등록 가능</p>
      </div>

      {/* Right: Player list */}
      <div className="flex-1 min-w-0 overflow-y-auto p-5 bg-white">
        <div className="flex flex-wrap items-center gap-2 lg:gap-4 mb-4">
          <h2 className="shrink-0 whitespace-nowrap text-2xl font-bold">선수 목록 <span className="text-gray-400 font-normal text-xl">({players.length}명)</span></h2>
          <input
            type="text"
            placeholder="검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="shrink-0 border border-gray-300 rounded-xl px-4 text-xl focus:outline-none focus:border-blue-400"
            style={{ height: 48, width: 200 }}
          />
          <button
            onClick={handleResetSession}
            disabled={!canResetSession || resettingSession}
            className="ml-auto shrink-0 whitespace-nowrap bg-red-500 text-white rounded-xl text-lg font-bold px-5 hover:bg-red-600 disabled:opacity-40 transition-colors"
            style={{ height: 48 }}
          >
            {resettingSession ? "초기화 중..." : "전체 초기화"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(["M", "F"] as const).map((gender) => {
            const list = filtered.filter((p) => p.gender === gender);
            return (
              <div key={gender}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className={`text-xl font-bold ${gender === "M" ? "text-blue-600" : "text-pink-500"}`}>
                    {gender === "M" ? "남 M" : "여 F"}
                  </span>
                  <span className="text-gray-400 text-lg">({list.length}명)</span>
                </div>
                <div className="space-y-2">
                  {list.map((p) => {
                    const inQueue = queuePlayerIds.has(p.id);
                    const inCourt = courtPlayerIds.has(p.id);
                    const courtName = inCourt ? courts.find((c) => c.teamA.includes(p.id) || c.teamB.includes(p.id))?.name : null;
                    const loading = addingToQueue.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-xl px-3 shadow border bg-white border-gray-100"
                        style={{ height: 64 }}
                      >
                        <span className="text-xl font-semibold flex-1 truncate">{p.name}</span>

                        <button
                          onClick={() => handleToggleGender(p.id, p.gender)}
                          disabled={resettingSession}
                          aria-label={`${p.name} 성별을 ${p.gender === "M" ? "여성" : "남성"}으로 변경`}
                          className={`inline-flex min-h-11 min-w-11 items-center justify-center text-xs px-2 py-1 rounded-lg font-bold border-2 transition-colors shrink-0 disabled:opacity-40 ${
                            p.gender === "M"
                              ? "bg-blue-100 text-blue-600 border-blue-300 hover:bg-pink-100 hover:text-pink-600 hover:border-pink-300"
                              : "bg-pink-100 text-pink-600 border-pink-300 hover:bg-blue-100 hover:text-blue-600 hover:border-blue-300"
                          }`}
                        >
                          {p.gender}
                        </button>

                        {inCourt ? (
                          <span className="text-xs px-2 py-1 rounded-full font-medium shrink-0 bg-green-100 text-green-700">
                            {courtName ?? "코트"}
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleQueue(p.id)}
                            disabled={loading || resettingSession}
                            aria-label={`${p.name} 선수를 대기열${inQueue ? "에서 제거" : "에 추가"}`}
                            className={`px-2 rounded-lg text-sm font-bold transition-colors shrink-0 disabled:opacity-50 ${
                              inQueue
                                ? "bg-yellow-100 text-yellow-700 border-2 border-yellow-300 hover:bg-red-100 hover:text-red-600 hover:border-red-300"
                                : "bg-blue-500 text-white hover:bg-blue-600"
                            }`}
                            style={{ height: 44 }}
                          >
                            {loading ? "..." : inQueue ? "대기중" : "추가"}
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          disabled={resettingSession}
                          aria-label={`${p.name} 선수 삭제`}
                          className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-300 hover:text-red-400 text-lg transition-colors disabled:opacity-40"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {list.length === 0 && (
                    <div className="text-center text-gray-400 py-8 text-lg rounded-xl bg-gray-50">
                      {search ? "검색 결과 없음" : "등록된 선수 없음"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
