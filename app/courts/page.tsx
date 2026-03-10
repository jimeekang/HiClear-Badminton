"use client";
import { useState, useEffect } from "react";
import { usePlayers, useQueue, useCourts } from "@/hooks/useFirestore";
import CourtCard from "@/components/CourtCard";
import { addCourt } from "@/lib/db";
import { assignPlayerToCourt } from "@/lib/courtOps";
import { QueueEntry } from "@/types";

interface PendingSlot {
  courtId: string;
  team: "A" | "B";
}

export default function CourtsPage() {
  const players = usePlayers();
  const queue = useQueue();
  const courts = useCourts();

  const [showAddForm, setShowAddForm] = useState(false);
  const [courtNumber, setCourtNumber] = useState("");
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null);

  const getPlayer = (id: string) => players.find((p) => p.id === id);

  // 코트에 이미 있는 선수는 대기열 패널에서 제외
  const courtPlayerIds = new Set(courts.flatMap((c) => [...c.teamA, ...c.teamB]));
  const availableQueue = queue.filter((e) => !courtPlayerIds.has(e.playerId));

  const handleAddCourt = async () => {
    const name = courtNumber.trim();
    if (!name) return;
    await addCourt(`코트 ${name}`);
    setCourtNumber("");
    setShowAddForm(false);
  };

  const handleSlotClick = (courtId: string, team: "A" | "B") => {
    const court = courts.find((c) => c.id === courtId);
    if (!court) return;
    // 이미 2명이면 패널 열지 않음
    const teamPlayers = team === "A" ? court.teamA : court.teamB;
    if (teamPlayers.length >= 2) return;
    setPendingSlot({ courtId, team });
  };

  const handleAssign = async (entry: QueueEntry) => {
    if (!pendingSlot) return;
    const court = courts.find((c) => c.id === pendingSlot.courtId);
    if (!court) return;

    const currentTeam = pendingSlot.team === "A" ? court.teamA : court.teamB;
    // 이미 2명이면 패널 닫고 중단
    if (currentTeam.length >= 2) {
      setPendingSlot(null);
      return;
    }

    await assignPlayerToCourt(court, pendingSlot.team, entry.playerId, entry.id);

    // 배정 후 팀이 찼으면 패널 닫기
    if (currentTeam.length + 1 >= 2) {
      setPendingSlot(null);
    }
  };

  const pendingCourt = courts.find((c) => c.id === pendingSlot?.courtId);

  // 팀이 Firestore 업데이트로 2명이 됐으면 자동으로 패널 닫기
  useEffect(() => {
    if (!pendingSlot || !pendingCourt) return;
    const teamPlayers = pendingSlot.team === "A" ? pendingCourt.teamA : pendingCourt.teamB;
    if (teamPlayers.length >= 2) {
      setPendingSlot(null);
    }
  }, [pendingCourt, pendingSlot]);

  return (
    <div className="flex" style={{ height: "calc(100vh - 72px)" }}>
      {/* 메인 코트 영역 */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* 헤더 */}
        <div className="flex items-center gap-4 mb-5">
          <h1 className="text-4xl font-bold">코트</h1>
          <span className="text-2xl text-gray-400">({courts.length}개)</span>
          <button
            onClick={() => { setShowAddForm((v) => !v); setCourtNumber(""); }}
            className="bg-blue-500 text-white px-5 rounded-xl font-bold text-xl hover:bg-blue-600 transition-colors ml-2"
            style={{ height: 56 }}
          >
            + 코트 추가
          </button>
        </div>

        {/* 코트 번호 입력 폼 */}
        {showAddForm && (
          <div className="flex items-center gap-3 mb-5 p-4 bg-white rounded-xl shadow border border-blue-200">
            <span className="text-xl font-semibold text-gray-600 whitespace-nowrap">코트 번호:</span>
            <input
              type="text"
              placeholder="예) 1, 2, A..."
              value={courtNumber}
              onChange={(e) => setCourtNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCourt()}
              autoFocus
              className="flex-1 border-2 border-gray-300 rounded-xl px-4 text-2xl focus:outline-none focus:border-blue-400"
              style={{ height: 60 }}
            />
            <button
              onClick={handleAddCourt}
              disabled={!courtNumber.trim()}
              className="bg-blue-500 text-white px-6 rounded-xl text-xl font-bold disabled:opacity-40 hover:bg-blue-600 transition-colors"
              style={{ height: 60 }}
            >
              생성
            </button>
            <button
              onClick={() => { setShowAddForm(false); setCourtNumber(""); }}
              className="px-4 rounded-xl text-xl border border-gray-300 hover:bg-gray-100 transition-colors"
              style={{ height: 60 }}
            >
              취소
            </button>
          </div>
        )}

        {/* 코트 그리드 */}
        {courts.length === 0 ? (
          <div className="text-center text-gray-400 py-24 text-2xl">
            <div className="text-6xl mb-4">🏸</div>
            <div>코트가 없습니다.</div>
            <div className="text-xl mt-2">위의 버튼으로 코트를 추가하세요.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {courts.map((court) => (
              <CourtCard
                key={court.id}
                court={court}
                players={players}
                queue={queue}
                onSlotClick={handleSlotClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* 오른쪽 패널: 대기열 */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        {/* 패널 헤더 */}
        <div className={`px-4 py-4 border-b-2 transition-colors ${
          pendingSlot ? "border-blue-400 bg-blue-50" : "border-gray-200"
        }`}>
          {pendingSlot ? (
            <div>
              <div className="text-lg font-bold text-blue-700 mb-1">
                📌 {pendingCourt?.name} · 팀 {pendingSlot.team} 배정 중
              </div>
              <div className="text-sm text-blue-500 mb-2">
                아래 선수를 탭하여 배정하세요
                {pendingCourt && (
                  <span className="ml-1">
                    ({pendingSlot.team === "A" ? pendingCourt.teamA.length : pendingCourt.teamB.length}/2명)
                  </span>
                )}
              </div>
              <button
                onClick={() => setPendingSlot(null)}
                className="text-sm text-blue-400 hover:text-blue-600 border border-blue-300 px-3 py-1 rounded-lg"
              >
                ← 취소
              </button>
            </div>
          ) : (
            <div>
              <div className="text-2xl font-bold">
                대기열
                <span className="text-gray-400 text-xl font-normal ml-2">({availableQueue.length}명)</span>
              </div>
              <div className="text-sm text-gray-400 mt-1">
                코트의 + 버튼을 눌러 선수를 배정하세요
              </div>
            </div>
          )}
        </div>

        {/* 대기열 목록 - M/F 2컬럼 */}
        <div className="flex-1 overflow-y-auto p-3">
          {availableQueue.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-lg">
              {queue.length === 0 ? "대기 중인 선수 없음" : "모든 선수가 코트에 있습니다"}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(["M", "F"] as const).map((gender) => {
                const genderQueue = availableQueue.filter(
                  (e) => getPlayer(e.playerId)?.gender === gender
                );
                return (
                  <div key={gender}>
                    <div className={`text-sm font-bold mb-1 px-1 ${gender === "M" ? "text-blue-500" : "text-pink-500"}`}>
                      {gender === "M" ? "남 M" : "여 F"} ({genderQueue.length})
                    </div>
                    <div className="space-y-1">
                      {genderQueue.map((entry) => {
                        const overallIdx = availableQueue.findIndex((e) => e.id === entry.id);
                        const p = getPlayer(entry.playerId);
                        return (
                          <button
                            key={entry.id}
                            onClick={() => pendingSlot && handleAssign(entry)}
                            disabled={!pendingSlot}
                            className={`w-full flex items-center gap-2 rounded-xl px-2 text-left transition-all ${
                              pendingSlot
                                ? gender === "M"
                                  ? "bg-blue-50 border-2 border-blue-300 hover:bg-blue-100 active:scale-95 cursor-pointer"
                                  : "bg-pink-50 border-2 border-pink-300 hover:bg-pink-100 active:scale-95 cursor-pointer"
                                : "bg-gray-50 border border-gray-200 cursor-default opacity-70"
                            }`}
                            style={{ height: 56 }}
                          >
                            <span className="text-gray-400 font-bold w-6 text-sm shrink-0">{overallIdx + 1}</span>
                            <span className="flex-1 text-lg font-semibold truncate">
                              {p?.name ?? "..."}
                            </span>
                          </button>
                        );
                      })}
                      {genderQueue.length === 0 && (
                        <div className={`text-center text-gray-400 py-4 text-sm rounded-xl ${
                          gender === "M" ? "bg-blue-50/50" : "bg-pink-50/50"
                        }`}>
                          없음
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 모바일용 배정 오버레이 */}
      {pendingSlot && (
        <div
          className="xl:hidden fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => setPendingSlot(null)}
        >
          <div
            className="w-full bg-white rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <span className="text-2xl font-bold text-blue-600">
                  {pendingCourt?.name} · 팀 {pendingSlot.team}
                </span>
                <div className="text-sm text-gray-400 mt-1">선수를 선택하세요</div>
              </div>
              <button onClick={() => setPendingSlot(null)} className="text-gray-400 text-2xl p-2">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["M", "F"] as const).map((gender) => {
                const genderQueue = availableQueue.filter(
                  (e) => getPlayer(e.playerId)?.gender === gender
                );
                return (
                  <div key={gender}>
                    <div className={`text-base font-bold mb-2 ${gender === "M" ? "text-blue-600" : "text-pink-500"}`}>
                      {gender === "M" ? "남 M" : "여 F"} ({genderQueue.length})
                    </div>
                    <div className="space-y-2">
                      {genderQueue.map((entry) => {
                        const overallIdx = availableQueue.findIndex((e) => e.id === entry.id);
                        const p = getPlayer(entry.playerId);
                        return (
                          <button
                            key={entry.id}
                            onClick={() => handleAssign(entry)}
                            className={`w-full flex items-center gap-3 border-2 rounded-xl px-3 hover:opacity-80 active:scale-95 transition-all ${
                              gender === "M"
                                ? "bg-blue-50 border-blue-200"
                                : "bg-pink-50 border-pink-200"
                            }`}
                            style={{ height: 64 }}
                          >
                            <span className="text-gray-400 font-bold w-7 text-lg shrink-0">{overallIdx + 1}</span>
                            <span className="flex-1 text-xl font-semibold truncate">{p?.name ?? "..."}</span>
                          </button>
                        );
                      })}
                      {genderQueue.length === 0 && (
                        <div className="text-center text-gray-400 py-4 text-lg">없음</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {availableQueue.length === 0 && (
              <div className="text-center text-gray-400 py-8 text-xl">대기 중인 선수 없음</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
