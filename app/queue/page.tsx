"use client";
import { useState } from "react";
import { usePlayers, useQueue, useCourts } from "@/hooks/useFirestore";
import QueueList from "@/components/QueueList";
import {
  removePlayersFromQueue,
  pushTeamToQueue,
  reorderQueueEntries,
} from "@/lib/queue";
import { QueueEntry } from "@/types";

export default function QueuePage() {
  const players = usePlayers();
  const queue = useQueue();
  const courts = useCourts();
  const [addingAll, setAddingAll] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const getPlayer = (id: string) => players.find((p) => p.id === id);

  const inSystemIds = new Set([
    ...queue.map((e) => e.playerId),
    ...courts.flatMap((c) => [...c.teamA, ...c.teamB]),
  ]);
  const notInQueue = players.filter((p) => !inSystemIds.has(p.id));

  const handleAddAll = async () => {
    if (notInQueue.length === 0) return;
    const request = pushTeamToQueue(notInQueue.map((p) => p.id));
    if (!request) return;
    setAddingAll(true);
    try {
      await request;
    } finally {
      setAddingAll(false);
    }
  };

  const maleQueue = queue.filter((e) => getPlayer(e.playerId)?.gender === "M");
  const femaleQueue = queue.filter((e) => getPlayer(e.playerId)?.gender === "F");

  // 특정 성별 재정렬 시: 해당 성별 슬롯을 새 순서로 교체, 다른 성별은 유지
  const handleReorder = async (
    gender: "M" | "F",
    reorderedGender: QueueEntry[]
  ): Promise<boolean> => {
    let gIdx = 0;
    const merged = queue.map((entry) => {
      const p = getPlayer(entry.playerId);
      return p?.gender === gender ? reorderedGender[gIdx++] : entry;
    });

    const request = reorderQueueEntries(merged);
    if (!request) return false;
    try {
      await request;
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <h1 className="text-4xl font-bold">대기열</h1>
        <span className="text-2xl text-gray-400 font-medium">{queue.length}명</span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`px-5 rounded-xl font-bold text-xl transition-colors border-2 ${
              editMode
                ? "bg-gray-800 border-gray-800 text-white"
                : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
            style={{ height: 56 }}
          >
            순서 편집
          </button>
          <button
            onClick={handleAddAll}
            disabled={addingAll || notInQueue.length === 0}
            className="bg-emerald-500 text-white px-5 rounded-xl font-bold text-xl hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ height: 56 }}
          >
            {addingAll ? "추가 중..." : `전체 추가 (+${notInQueue.length}명)`}
          </button>
        </div>
      </div>

      {/* 성별 2컬럼 뷰 (편집 모드 / 일반 모드 공통) */}
      <div className="grid grid-cols-2 gap-4">
        {/* 남자 */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="text-xl font-bold text-blue-600">남 M</span>
            <span className="text-gray-400 text-lg">({maleQueue.length}명)</span>
          </div>

          {editMode ? (
            <QueueList
              queue={maleQueue}
              players={players}
              onReorder={(r) => handleReorder("M", r)}
              emptyText="대기 없음"
            />
          ) : (
            <div className="space-y-2">
              {maleQueue.map((entry, i) => {
                const player = getPlayer(entry.playerId);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl"
                    style={{ height: 60 }}
                  >
                    <span className="text-gray-400 font-bold w-10 text-lg text-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-xl font-semibold truncate">
                      {player?.name ?? "..."}
                    </span>
                    <button
                      onClick={() => removePlayersFromQueue([entry.id])}
                      className="flex items-center justify-center w-10 h-full text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-r-xl transition-colors text-xl"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {maleQueue.length === 0 && (
                <div className="text-center text-gray-400 py-8 text-lg bg-blue-50/50 rounded-xl">
                  대기 없음
                </div>
              )}
            </div>
          )}
        </div>

        {/* 여자 */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="text-xl font-bold text-pink-500">여 F</span>
            <span className="text-gray-400 text-lg">({femaleQueue.length}명)</span>
          </div>

          {editMode ? (
            <QueueList
              queue={femaleQueue}
              players={players}
              onReorder={(r) => handleReorder("F", r)}
              emptyText="대기 없음"
            />
          ) : (
            <div className="space-y-2">
              {femaleQueue.map((entry, i) => {
                const player = getPlayer(entry.playerId);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 bg-pink-50 border border-pink-100 rounded-xl"
                    style={{ height: 60 }}
                  >
                    <span className="text-gray-400 font-bold w-10 text-lg text-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-xl font-semibold truncate">
                      {player?.name ?? "..."}
                    </span>
                    <button
                      onClick={() => removePlayersFromQueue([entry.id])}
                      className="flex items-center justify-center w-10 h-full text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-r-xl transition-colors text-xl"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {femaleQueue.length === 0 && (
                <div className="text-center text-gray-400 py-8 text-lg bg-pink-50/50 rounded-xl">
                  대기 없음
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editMode && (
        <p className="text-gray-400 text-base mt-3 text-center">
          드래그로 성별 내 순서를 변경합니다.
        </p>
      )}
    </div>
  );
}
