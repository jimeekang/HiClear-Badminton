"use client";
import { useState, useRef, useEffect } from "react";
import { Court, Player, QueueEntry } from "@/types";
import { processGameResult } from "@/lib/game";
import { updateCourt } from "@/lib/db";
import { runFirestoreSessionMutation } from "@/lib/firestoreSessionReset";
import {
  deleteCourtAndQueuePlayers,
  removePlayerFromCourt,
  sendCourtPlayersToQueue,
} from "@/lib/courtOps";

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
  onBeforeAction?: () => void;
}

function TeamHalf({ court, team, ids, games, bgClass, labelClass, players, onSlotClick, disabled, onBeforeAction }: TeamHalfProps) {
  const getPlayer = (id: string) => players.find((p) => p.id === id);

  const handleRemovePlayer = (pid: string) => {
    if (disabled) return;
    const p = getPlayer(pid);
    if (!confirm(`${p?.name ?? "선수"}를 코트에서 제거하고 대기열로 보내시겠습니까?`)) return;
    const request = removePlayerFromCourt(court, team, pid);
    if (!request) return;
    onBeforeAction?.();
    void request;
  };

  return (
    <div className={`flex-1 ${bgClass} rounded-lg p-2 flex flex-col gap-1.5`}>
      <div className={`text-center font-bold text-base ${labelClass}`}>
        팀 {team}
        {games > 0 && (
          <span className="ml-1.5 text-orange-500 text-sm">
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
            className="w-full bg-white rounded-md px-2 text-left shadow-sm border border-white/60 hover:bg-red-50 hover:border-red-200 disabled:hover:bg-white disabled:hover:border-white/60 transition-colors flex items-center gap-1.5"
            style={{ height: 44 }}
          >
            <span className="flex-1 text-base font-semibold truncate">
              {p?.name ?? "..."}
            </span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
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
          className="w-full bg-white/50 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center hover:bg-white/80 hover:border-gray-400 disabled:opacity-50 transition-colors"
          style={{ height: 44 }}
        >
          <span className="text-2xl text-gray-400">+</span>
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
  isActive?: boolean;
  dragHandle?: React.ReactNode;
  onBeforeAction?: () => void;
  onActivate?: () => void;
  onAnnounce?: () => void;
  mutationDisabled?: boolean;
  resultDisabled?: boolean;
  onResultStart?: () => boolean;
  onResultEnd?: () => void;
}

export default function CourtCard({ court, players, queue, onSlotClick, isActive, dragHandle, onBeforeAction, onAnnounce, mutationDisabled = false, resultDisabled, onResultStart, onResultEnd }: Props) {
  const [processing, setProcessing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(court.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  useEffect(() => {
    setNameInput(court.name);
  }, [court.name]);

  const handleNameSubmit = async () => {
    if (mutationDisabled) {
      setEditingName(false);
      setNameInput(court.name);
      return;
    }
    const trimmed = nameInput.trim();
    setEditingName(false);
    if (!trimmed || trimmed === court.name) { setNameInput(court.name); return; }
    const request = runFirestoreSessionMutation(() =>
      updateCourt(court.id, { name: trimmed })
    );
    if (!request) {
      setNameInput(court.name);
      return;
    }
    await request;
  };

  const handleSendToQueue = async () => {
    if (mutationDisabled) return;
    const count = court.teamA.length + court.teamB.length;
    if (count === 0) { alert("코트에 선수가 없습니다."); return; }
    if (!confirm(`${count}명을 대기열로 보내시겠습니까?`)) return;
    const request = sendCourtPlayersToQueue(court);
    if (!request) return;
    onBeforeAction?.();
    await request;
  };

  const handleRemoveCourt = async () => {
    if (mutationDisabled) return;
    const count = court.teamA.length + court.teamB.length;
    const msg =
      count > 0
        ? `코트를 삭제하면 ${count}명이 대기열로 이동합니다. 삭제하시겠습니까?`
        : "코트를 삭제하시겠습니까?";
    if (!confirm(msg)) return;
    const request = deleteCourtAndQueuePlayers(court);
    if (request) await request;
  };

  const handleResult = async (winner: "A" | "B") => {
    if (court.teamA.length < 2 || court.teamB.length < 2) {
      alert("양 팀이 2명씩 있어야 결과를 처리할 수 있습니다.");
      return;
    }
    if (processing || mutationDisabled || resultDisabled) return;
    if (onResultStart && !onResultStart()) return;
    const request = processGameResult(court, winner, queue);
    if (!request) {
      onResultEnd?.();
      return;
    }
    setProcessing(true);
    try {
      onBeforeAction?.();
      await request;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "오류가 발생했습니다.";
      alert(msg);
    } finally {
      setProcessing(false);
      onResultEnd?.();
    }
  };

  const isReady = court.teamA.length === 2 && court.teamB.length === 2;
  const handleAnnounce = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onAnnounce?.();
  };

  return (
    <div className={`bg-white rounded-xl shadow-md overflow-hidden border-2 transition-all ${isActive ? "border-orange-400 ring-4 ring-orange-300 ring-offset-2 shadow-orange-200 shadow-lg" : "border-gray-200"} ${processing ? "opacity-70" : ""}`}>
      {/* 헤더 */}
      <div className={`flex items-center px-2 py-2 text-white gap-1.5 transition-colors ${isActive ? "bg-orange-500" : "bg-gray-800"}`}>
        {dragHandle}
        {editingName ? (
          <input
            ref={nameInputRef}
            disabled={mutationDisabled}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => { if (e.key === "Enter") handleNameSubmit(); if (e.key === "Escape") { setEditingName(false); setNameInput(court.name); } }}
            className="h-11 flex-1 min-w-0 rounded border border-white/50 bg-white/20 px-1 text-lg font-bold text-white outline-none"
          />
        ) : (
          <div className="flex-1 flex items-center gap-1 min-w-0">
            <button
              onClick={() => { setNameInput(court.name); setEditingName(true); }}
              disabled={mutationDisabled}
              title="탭하여 이름 변경"
              className="min-h-11 min-w-0 flex-1 truncate text-left text-lg font-bold transition-colors hover:text-yellow-300"
            >
              {court.name}
            </button>
            <button
              onClick={handleAnnounce}
              disabled={!isReady || processing || mutationDisabled}
              title="이 코트 음성 안내"
              className="h-11 min-w-11 shrink-0 rounded border border-white/40 px-2 text-xs text-white/90 transition-colors hover:bg-white/20 disabled:opacity-40"
            >
              음성
            </button>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSendToQueue}
            disabled={processing || mutationDisabled || (court.teamA.length + court.teamB.length === 0)}
            className="h-11 rounded border border-white/30 px-2 text-xs text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-40"
          >
            대기열로
          </button>
          <button
            onClick={handleRemoveCourt}
            disabled={processing || mutationDisabled}
            className="h-11 min-w-11 rounded border border-red-400 px-2 text-xs text-red-300 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-40"
          >
            삭제
          </button>
        </div>
      </div>

      {/* 코트 (네모 반반) */}
      <div className="flex p-2 gap-1">
        <TeamHalf
          court={court}
          team="A"
          ids={court.teamA}
          games={court.gamesA ?? 0}
          bgClass="bg-blue-50"
          labelClass="text-blue-700"
          players={players}
          onSlotClick={onSlotClick}
          disabled={processing || mutationDisabled}
          onBeforeAction={onBeforeAction}
        />
        {/* 네트 라인 */}
        <div className="flex items-stretch justify-center w-3">
          <div className="w-0.5 bg-gray-300 rounded-full" />
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
          disabled={processing || mutationDisabled}
          onBeforeAction={onBeforeAction}
        />
      </div>

      {/* 나오는팀 버튼 */}
      <div className="flex gap-2 px-2 pb-2">
        <button
          onClick={() => handleResult("A")}
          disabled={!isReady || processing || mutationDisabled || resultDisabled}
          className="flex-1 bg-blue-500 text-white rounded-lg font-bold text-base disabled:opacity-30 disabled:cursor-not-allowed hover:bg-blue-600 active:scale-95 transition-all"
          style={{ height: 48 }}
        >
          {processing ? "처리 중..." : "A팀 나오는팀"}
        </button>
        <button
          onClick={() => handleResult("B")}
          disabled={!isReady || processing || mutationDisabled || resultDisabled}
          className="flex-1 bg-green-500 text-white rounded-lg font-bold text-base disabled:opacity-30 disabled:cursor-not-allowed hover:bg-green-600 active:scale-95 transition-all"
          style={{ height: 48 }}
        >
          {processing ? "처리 중..." : "B팀 나오는팀"}
        </button>
      </div>
    </div>
  );
}
