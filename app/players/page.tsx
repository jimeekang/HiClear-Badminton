"use client";
import { useRef } from "react";
import { useState } from "react";
import { usePlayers, useQueue, useCourts } from "@/hooks/useFirestore";
import { addPlayer, deletePlayer, updatePlayerGender } from "@/lib/db";
import { addPlayerToQueue, clearQueue, removePlayersFromQueue } from "@/lib/queue";

export default function PlayersPage() {
  const players = usePlayers();
  const queue = useQueue();
  const courts = useCourts();

  const [name, setName] = useState("");
  const [gender, setGender] = useState<"M" | "F">("M");
  const [autoQueue, setAutoQueue] = useState(true);
  const [search, setSearch] = useState("");
  const [addingToQueue, setAddingToQueue] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef(""); // 동기적 name 추적 (중복 방지용)

  const queuePlayerIds = new Set(queue.map((e) => e.playerId));
  const courtPlayerIds = new Set(courts.flatMap((c) => [...c.teamA, ...c.teamB]));

  const handleAdd = () => {
    const trimmed = nameRef.current.trim();
    if (!trimmed) return; // nameRef가 이미 비었으면 중복 실행 방지

    // 동기적으로 즉시 초기화 - Firebase 일절 기다리지 않음
    nameRef.current = "";
    setName("");
    inputRef.current?.focus();

    // Firebase는 완전 백그라운드 처리
    addPlayer(trimmed, gender)
      .then((id) => {
        if (autoQueue) return addPlayerToQueue(id);
      })
      .catch((err) => {
        console.error("선수 등록 실패:", err);
        alert("선수 등록에 실패했습니다.\nFirebase 연결을 확인해주세요.");
      });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name} 선수를 삭제하시겠습니까?\n(대기열 및 코트에서도 자동으로 제거됩니다)`)) return;
    await deletePlayer(id);
  };

  const handleClearQueue = async () => {
    if (queue.length === 0) return;
    if (!confirm(`대기열의 선수 ${queue.length}명을 모두 제거하시겠습니까?`)) return;
    await clearQueue();
  };

  const handleToggleQueue = async (id: string) => {
    if (addingToQueue.has(id)) return;
    setAddingToQueue((prev) => new Set([...prev, id]));
    try {
      if (queuePlayerIds.has(id)) {
        const entry = queue.find((e) => e.playerId === id);
        if (entry) await removePlayersFromQueue([entry.id]);
      } else {
        await addPlayerToQueue(id);
      }
    } finally {
      setAddingToQueue((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-72px)]">
      {/* Left: Registration panel */}
      <div className="w-96 bg-white border-r border-gray-200 flex flex-col p-5 gap-4">
        <h2 className="text-2xl font-bold text-blue-900">선수 등록</h2>

        <input
          ref={inputRef}
          type="text"
          placeholder="이름 입력"
          value={name}
          onChange={(e) => { setName(e.target.value); nameRef.current = e.target.value; }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          autoFocus
          className="border-2 border-blue-200 rounded-xl px-4 text-2xl focus:outline-none focus:border-blue-600 bg-white"
          style={{ height: 64 }}
        />

        <div className="flex gap-3">
          <button
            onClick={() => setGender("M")}
            className={`flex-1 rounded-xl text-2xl font-bold transition-colors ${
              gender === "M" ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-400 border-2 border-blue-200"
            }`}
            style={{ height: 64 }}
          >
            남 (M)
          </button>
          <button
            onClick={() => setGender("F")}
            className={`flex-1 rounded-xl text-2xl font-bold transition-colors ${
              gender === "F" ? "bg-pink-500 text-white" : "bg-pink-50 text-pink-400 border-2 border-pink-200"
            }`}
            style={{ height: 64 }}
          >
            여 (F)
          </button>
        </div>

        <button
          onClick={() => setAutoQueue((v) => !v)}
          className={`flex items-center gap-3 px-4 rounded-xl border-2 text-xl font-medium transition-colors ${
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
          disabled={!name.trim()}
          className="bg-blue-500 text-white rounded-xl text-2xl font-bold disabled:opacity-40 hover:bg-blue-600 transition-colors"
          style={{ height: 80 }}
        >
          등록
        </button>

        <p className="text-sm text-gray-400 text-center">Enter 키로 연속 등록 가능</p>
      </div>

      {/* Right: Player list */}
      <div className="flex-1 overflow-y-auto p-5 bg-white">
        <div className="flex items-center gap-4 mb-4">
          <h2 className="text-2xl font-bold">선수 목록 <span className="text-gray-400 font-normal text-xl">({players.length}명)</span></h2>
          <input
            type="text"
            placeholder="검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded-xl px-4 text-xl focus:outline-none focus:border-blue-400"
            style={{ height: 48, width: 200 }}
          />
          <button
            onClick={handleClearQueue}
            disabled={queue.length === 0}
            className="ml-auto bg-red-500 text-white rounded-xl text-lg font-bold px-5 hover:bg-red-600 disabled:opacity-40 transition-colors"
            style={{ height: 48 }}
          >
            대기열 전체 제거
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
                          onClick={() => updatePlayerGender(p.id, p.gender === "M" ? "F" : "M")}
                          className={`text-xs px-2 py-1 rounded-lg font-bold border-2 transition-colors shrink-0 ${
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
                            disabled={loading}
                            className={`px-2 rounded-lg text-sm font-bold transition-colors shrink-0 disabled:opacity-50 ${
                              inQueue
                                ? "bg-yellow-100 text-yellow-700 border-2 border-yellow-300 hover:bg-red-100 hover:text-red-600 hover:border-red-300"
                                : "bg-blue-500 text-white hover:bg-blue-600"
                            }`}
                            style={{ height: 40 }}
                          >
                            {loading ? "..." : inQueue ? "대기중" : "추가"}
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          className="text-gray-300 hover:text-red-400 text-lg px-1 transition-colors shrink-0"
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
