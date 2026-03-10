"use client";
import { useState } from "react";
import { Court, Player, QueueEntry } from "@/types";
import { processGameResult } from "@/lib/game";
import { deleteCourt } from "@/lib/db";
import { pushTeamToQueue } from "@/lib/queue";
import { removePlayerFromCourt } from "@/lib/courtOps";

// ─── TeamHalf: 외부 컴포넌트 (CourtCard 렌더마다 unmount 방지) ───
interface TeamHalfProps {
  court: Court;
  team: "A" | "B";
  ids: string[];
  games: number;
  bgClass: string;
  labelClass: string;
  players: Player[];
  onSlotClick: (courtId: string, team: "A" | "B") => void;
  disabled: boolean;
}

function TeamHalf({ court, team, ids, games, bgClass, labelClass, players, onSlotClick, disabled }: TeamHalfProps) {
  const getPlayer = (id: string) => players.find((p) => p.id === id);

  const handleRemovePlayer = (pid: string) => {
    if (disabled) return;
    const p = getPlayer(pid);
    if (!confirm(`${p?.name ?? "선수"}를 코트에서 제거하고 대기열로 보내시겠습니까?`)) return;
    removePlayerFromCourt(court, team, pid);
  };

  return (
    <div className={`flex-1 ${bgClass} rounded-xl p-3 flex flex-col gap-2`}>
      <div className={`text-center font-bold text-xl ${labelClass}`}>
        팀 {team}
        {games > 0 && (
          <span className="ml-2 text-orange-500">
            {games}게임
          </span>
        )}
      </div>

      {/* 배정된 선수 */}
      {ids.map((pid) => {
        const p = getPlayer(pid);
        return (
          <button
            key={pid}
            onClick={() => handleRemovePlayer(pid)}
            disabled={disabled}
            title="탭하면 대기열로 이동"
            className="w-full bg-white rounded-lg px-3 text-left shadow-sm border border-white/60 hover:bg-red-50 hover:border-red-200 disabled:hover:bg-white disabled:hover:border-white/60 transition-colors flex items-center gap-2"
            style={{ height: 64 }}
          >
            <span className="flex-1 text-xl font-semibold truncate">
              {p?.name ?? "..."}
            </span>
            <span className={`text-sm font-bold px-2 py-0.5 rounded-lg shrink-0 ${
              p?.gender === "M"
                ? "bg-blue-100 text-blue-700"
                : p?.gender === "F"
                ? "bg-pink-100 text-pink-600"
                : "bg-gray-100 text-gray-400"
            }`}>
              {p?.gender ?? "?"}
            </span>
          </button>
        );
      })}

      {/* 빈 슬롯 */}
      {Array.from({ length: Math.max(0, 2 - ids.length) }).map((_, i) => (
        <button
          key={`empty-${i}`}
          onClick={() => !disabled && onSlotClick(court.id, team)}
          disabled={disabled}
          className="w-full bg-white/50 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:bg-white/80 hover:border-gray-400 disabled:opacity-50 transition-colors"
          style={{ height: 64 }}
        >
          <span className="text-3xl text-gray-400">+</span>
        </button>
      ))}
    </div>
  );
}

// ─── CourtCard ───
interface Props {
  court: Court;
  players: Player[];
  queue: QueueEntry[];
  onSlotClick: (courtId: string, team: "A" | "B") => void;
}

export default function CourtCard({ court, players, queue, onSlotClick }: Props) {
  const [processing, setProcessing] = useState(false);

  const handleRemoveCourt = async () => {
    const count = court.teamA.length + court.teamB.length;
    const msg =
      count > 0
        ? `코트를 삭제하면 ${count}명이 대기열로 이동합니다. 삭제하시겠습니까?`
        : "코트를 삭제하시겠습니까?";
    if (!confirm(msg)) return;
    const all = [...court.teamA, ...court.teamB];
    if (all.length > 0) await pushTeamToQueue(all);
    await deleteCourt(court.id);
  };

  const handleResult = async (winner: "A" | "B") => {
    if (court.teamA.length < 2 || court.teamB.length < 2) {
      alert("양 팀이 2명씩 있어야 결과를 처리할 수 있습니다.");
      return;
    }
    if (processing) return;
    setProcessing(true);
    try {
      await processGameResult(court, winner, queue);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "오류가 발생했습니다.";
      alert(msg);
    } finally {
      setProcessing(false);
    }
  };

  const isReady = court.teamA.length === 2 && court.teamB.length === 2;

  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-200 transition-opacity ${processing ? "opacity-70" : ""}`}>
      {/* 헤더 */}
      <div className="flex justify-between items-center px-5 py-3 bg-gray-800 text-white">
        <span className="text-2xl font-bold">{court.name}</span>
        <button
          onClick={handleRemoveCourt}
          disabled={processing}
          className="text-red-400 text-sm px-3 py-1 border border-red-400 rounded-lg hover:bg-red-500 hover:text-white disabled:opacity-40 transition-colors"
        >
          코트 삭제
        </button>
      </div>

      {/* 코트 (네모 반반) */}
      <div className="flex p-4 gap-1">
        <TeamHalf
          court={court}
          team="A"
          ids={court.teamA}
          games={court.gamesA ?? 0}
          bgClass="bg-blue-50"
          labelClass="text-blue-700"
          players={players}
          onSlotClick={onSlotClick}
          disabled={processing}
        />
        {/* 네트 라인 */}
        <div className="flex items-stretch justify-center w-5">
          <div className="w-1 bg-gray-300 rounded-full" />
        </div>
        <TeamHalf
          court={court}
          team="B"
          ids={court.teamB}
          games={court.gamesB ?? 0}
          bgClass="bg-green-50"
          labelClass="text-green-700"
          players={players}
          onSlotClick={onSlotClick}
          disabled={processing}
        />
      </div>

      {/* 승부 버튼 */}
      <div className="flex gap-3 px-4 pb-4">
        <button
          onClick={() => handleResult("A")}
          disabled={!isReady || processing}
          className="flex-1 bg-blue-500 text-white rounded-xl font-bold text-xl disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-600 active:scale-95 transition-all"
          style={{ height: 72 }}
        >
          {processing ? "처리 중..." : "팀 A 승 🏆"}
        </button>
        <button
          onClick={() => handleResult("B")}
          disabled={!isReady || processing}
          className="flex-1 bg-green-500 text-white rounded-xl font-bold text-xl disabled:opacity-30 disabled:cursor-not-allowed hover:bg-green-600 active:scale-95 transition-all"
          style={{ height: 72 }}
        >
          {processing ? "처리 중..." : "팀 B 승 🏆"}
        </button>
      </div>
    </div>
  );
}
