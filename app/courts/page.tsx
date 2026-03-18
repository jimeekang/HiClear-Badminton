"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePlayers, useQueue, useCourts } from "@/hooks/useFirestore";
import CourtCard from "@/components/CourtCard";
import { addCourt } from "@/lib/db";
import { assignPlayerToCourt } from "@/lib/courtOps";
import { Player, QueueEntry } from "@/types";
import { AppSnapshot, captureSnapshot, restoreSnapshot, sendAllCourtsToQueue } from "@/lib/snapshot";
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

function CourtQueueItem({ entry, index, player, gender, onClick, active }: {
  entry: QueueEntry;
  index: number;
  player?: Player;
  gender: "M" | "F";
  onClick: () => void;
  active: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const bgClass = active
    ? gender === "M"
      ? "bg-blue-50 border-2 border-blue-400 hover:bg-blue-100 active:scale-95 cursor-pointer"
      : "bg-pink-50 border-2 border-pink-400 hover:bg-pink-100 active:scale-95 cursor-pointer"
    : gender === "M"
      ? "bg-blue-50/60 border border-blue-200"
      : "bg-pink-50/60 border border-pink-200";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, height: 40 }}
      onClick={active ? onClick : undefined}
      className={`flex items-center gap-1 rounded-lg transition-all ${bgClass}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center px-1.5 text-gray-300 cursor-grab active:cursor-grabbing select-none h-full"
        style={{ touchAction: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <svg width="8" height="14" viewBox="0 0 16 24" fill="currentColor">
          <circle cx="5" cy="6" r="2" /><circle cx="11" cy="6" r="2" />
          <circle cx="5" cy="12" r="2" /><circle cx="11" cy="12" r="2" />
          <circle cx="5" cy="18" r="2" /><circle cx="11" cy="18" r="2" />
        </svg>
      </div>
      <span className="text-gray-400 font-bold w-4 text-xs shrink-0">{index + 1}</span>
      <span className="flex-1 text-xs font-semibold truncate">{player?.name ?? "..."}</span>
    </div>
  );
}

interface PendingSlot {
  courtId: string;
  team: "A" | "B";
}

function SortableCourtCard(props: React.ComponentProps<typeof CourtCard>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.court.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-50 z-50" : ""}
    >
      <CourtCard
        {...props}
        dragHandle={
          <div
            {...attributes}
            {...listeners}
            className="flex items-center justify-center w-5 text-gray-400 hover:text-gray-200 cursor-grab active:cursor-grabbing select-none shrink-0"
            style={{ touchAction: "none" }}
          >
            <svg width="10" height="16" viewBox="0 0 16 24" fill="currentColor">
              <circle cx="5" cy="4" r="2" /><circle cx="11" cy="4" r="2" />
              <circle cx="5" cy="12" r="2" /><circle cx="11" cy="12" r="2" />
              <circle cx="5" cy="20" r="2" /><circle cx="11" cy="20" r="2" />
            </svg>
          </div>
        }
      />
    </div>
  );
}

export default function CourtsPage() {
  const players = usePlayers();
  const queue = useQueue();
  const courts = useCourts();

  const [showAddForm, setShowAddForm] = useState(false);
  const [courtNumber, setCourtNumber] = useState("");
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null);
  const [activeCourtId, setActiveCourtId] = useState<string | null>(null);
  const [history, setHistory] = useState<AppSnapshot[]>([]);
  const [future, setFuture] = useState<AppSnapshot[]>([]);
  const [undoLoading, setUndoLoading] = useState(false);

  const [localCourts, setLocalCourts] = useState<typeof courts>([]);
  const courtDraggingRef = useRef(false);
  const [localMaleQueue, setLocalMaleQueue] = useState<QueueEntry[]>([]);
  const [localFemaleQueue, setLocalFemaleQueue] = useState<QueueEntry[]>([]);
  const maleDraggingRef = useRef(false);
  const femaleDraggingRef = useRef(false);

  const courtSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  // courts Firestore 업데이트 → localCourts 동기화 (드래그 중이 아닐 때)
  useEffect(() => {
    if (courtDraggingRef.current) return;
    setLocalCourts((prev) => {
      if (prev.length === 0) {
        // 초기 로드: order 필드 기준 정렬, 없으면 Firestore 순서 유지
        return [...courts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      }
      // 데이터 업데이트: 로컬 순서 유지하면서 각 코트 데이터 갱신
      const courtMap = new Map(courts.map((c) => [c.id, c]));
      const updated = prev.map((c) => courtMap.get(c.id)).filter(Boolean) as typeof courts;
      courts.forEach((c) => { if (!prev.find((p) => p.id === c.id)) updated.push(c); });
      return updated;
    });
  }, [courts]);

  const handleCourtDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    courtDraggingRef.current = false;
    if (!over || active.id === over.id) return;
    const oldIdx = localCourts.findIndex((c) => c.id === active.id);
    const newIdx = localCourts.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(localCourts, oldIdx, newIdx);
    setLocalCourts(reordered);
    const batch = writeBatch(db);
    reordered.forEach((court, idx) => {
      batch.update(doc(db, "courts", court.id), { order: idx });
    });
    await batch.commit();
  };

  const queueSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const saveSnapshot = useCallback(() => {
    setHistory((prev) => [...prev.slice(-9), captureSnapshot(courts, queue)]);
    setFuture([]);
  }, [courts, queue]);

  const handleUndo = async () => {
    if (history.length === 0 || undoLoading) return;
    setUndoLoading(true);
    const prev = history[history.length - 1];
    const current = captureSnapshot(courts, queue);
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [current, ...f.slice(0, 9)]);
    try { await restoreSnapshot(prev, courts); } catch (e) { alert("되돌리기 실패"); }
    setUndoLoading(false);
  };

  const handleRedo = async () => {
    if (future.length === 0 || undoLoading) return;
    setUndoLoading(true);
    const next = future[0];
    const current = captureSnapshot(courts, queue);
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h.slice(-9), current]);
    try { await restoreSnapshot(next, courts); } catch (e) { alert("다시실행 실패"); }
    setUndoLoading(false);
  };

  const handleSendAllToQueue = async () => {
    const total = courts.reduce((n, c) => n + c.teamA.length + c.teamB.length, 0);
    if (total === 0) { alert("코트에 선수가 없습니다."); return; }
    if (!confirm(`모든 코트의 선수 ${total}명을 대기열로 보내시겠습니까?`)) return;
    saveSnapshot();
    try { await sendAllCourtsToQueue(courts); } catch (e) { alert("오류가 발생했습니다."); }
  };

  const getPlayer = (id: string) => players.find((p) => p.id === id);

  // 코트에 이미 있는 선수는 대기열 패널에서 제외
  const courtPlayerIds = new Set(courts.flatMap((c) => [...c.teamA, ...c.teamB]));
  const availableQueue = queue.filter((e) => !courtPlayerIds.has(e.playerId));

  useEffect(() => {
    if (!maleDraggingRef.current) {
      const courtIds = new Set(courts.flatMap((c) => [...c.teamA, ...c.teamB]));
      setLocalMaleQueue(
        queue.filter(e => !courtIds.has(e.playerId) && players.find(p => p.id === e.playerId)?.gender === "M")
      );
    }
  }, [queue, courts, players]);

  useEffect(() => {
    if (!femaleDraggingRef.current) {
      const courtIds = new Set(courts.flatMap((c) => [...c.teamA, ...c.teamB]));
      setLocalFemaleQueue(
        queue.filter(e => !courtIds.has(e.playerId) && players.find(p => p.id === e.playerId)?.gender === "F")
      );
    }
  }, [queue, courts, players]);

  const handleQueueDragEnd = async (event: DragEndEvent, gender: "M" | "F") => {
    const { active, over } = event;
    const isM = gender === "M";
    (isM ? maleDraggingRef : femaleDraggingRef).current = false;
    if (!over || active.id === over.id) return;

    const localQ = isM ? localMaleQueue : localFemaleQueue;
    const setLocalQ = isM ? setLocalMaleQueue : setLocalFemaleQueue;
    const oldIdx = localQ.findIndex(e => e.id === active.id);
    const newIdx = localQ.findIndex(e => e.id === over.id);
    const reordered = arrayMove(localQ, oldIdx, newIdx);
    setLocalQ(reordered);

    let gIdx = 0;
    const merged = availableQueue.map(entry => {
      const p = players.find(p => p.id === entry.playerId);
      return p?.gender === gender ? reordered[gIdx++] : entry;
    });
    const batch = writeBatch(db);
    merged.forEach((entry, idx) => {
      batch.update(doc(db, "queue", entry.id), { position: idx + 1 });
    });
    await batch.commit();
  };

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
    setActiveCourtId(courtId);
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

    saveSnapshot();
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
      <div className="flex-1 overflow-y-auto p-3">
        {/* 헤더 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h1 className="text-2xl font-bold">코트</h1>
          <span className="text-lg text-gray-400">({courts.length}개)</span>
          <button
            onClick={() => { setShowAddForm((v) => !v); setCourtNumber(""); }}
            className="bg-blue-500 text-white px-4 rounded-lg font-bold text-base hover:bg-blue-600 transition-colors ml-2"
            style={{ height: 40 }}
          >
            + 코트 추가
          </button>
          <button
            onClick={handleSendAllToQueue}
            className="bg-blue-700 text-white px-4 rounded-lg font-bold text-base hover:bg-blue-800 transition-colors"
            style={{ height: 40 }}
          >
            전체 대기열로
          </button>
          <button
            onClick={handleUndo}
            disabled={history.length === 0 || undoLoading}
            title="되돌리기"
            className="px-3 rounded-lg font-bold text-base border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-30 transition-colors text-gray-600"
            style={{ height: 40 }}
          >
            ↩ 되돌리기
          </button>
          <button
            onClick={handleRedo}
            disabled={future.length === 0 || undoLoading}
            title="다시실행"
            className="px-3 rounded-lg font-bold text-base border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-30 transition-colors text-gray-600"
            style={{ height: 40 }}
          >
            ↪ 다시실행
          </button>
        </div>

        {/* 코트 번호 입력 폼 */}
        {showAddForm && (
          <div className="flex items-center gap-2 mb-3 p-3 bg-white rounded-lg shadow border border-blue-200">
            <span className="text-base font-semibold text-gray-600 whitespace-nowrap">코트 번호:</span>
            <input
              type="text"
              placeholder="예) 1, 2, A..."
              value={courtNumber}
              onChange={(e) => setCourtNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCourt()}
              autoFocus
              className="flex-1 border-2 border-gray-300 rounded-lg px-3 text-lg focus:outline-none focus:border-blue-400"
              style={{ height: 44 }}
            />
            <button
              onClick={handleAddCourt}
              disabled={!courtNumber.trim()}
              className="bg-blue-500 text-white px-4 rounded-lg text-base font-bold disabled:opacity-40 hover:bg-blue-600 transition-colors"
              style={{ height: 44 }}
            >
              생성
            </button>
            <button
              onClick={() => { setShowAddForm(false); setCourtNumber(""); }}
              className="px-3 rounded-lg text-base border border-gray-300 bg-white hover:bg-gray-100 transition-colors"
              style={{ height: 44 }}
            >
              취소
            </button>
          </div>
        )}

        {/* 코트 그리드 */}
        {localCourts.length === 0 ? (
          <div className="text-center text-gray-400 py-24 text-2xl">
            <div className="text-6xl mb-4">🏸</div>
            <div>코트가 없습니다.</div>
            <div className="text-xl mt-2">위의 버튼으로 코트를 추가하세요.</div>
          </div>
        ) : (
          <DndContext
            sensors={courtSensors}
            collisionDetection={closestCenter}
            onDragStart={() => { courtDraggingRef.current = true; }}
            onDragEnd={handleCourtDragEnd}
            onDragCancel={() => { courtDraggingRef.current = false; }}
          >
            <SortableContext items={localCourts.map((c) => c.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {localCourts.map((court) => (
                  <SortableCourtCard
                    key={court.id}
                    court={court}
                    players={players}
                    queue={queue}
                    onSlotClick={handleSlotClick}
                    isActive={activeCourtId === court.id}
                    onBeforeAction={saveSnapshot}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* 오른쪽 패널: 대기열 */}
      <div className="w-56 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        {/* 패널 헤더 */}
        <div className={`px-3 py-2 border-b-2 transition-colors ${
          pendingSlot ? "border-blue-400 bg-blue-50" : "border-gray-200"
        }`}>
          {pendingSlot ? (
            <div>
              <div className="text-sm font-bold text-blue-700 mb-1">
                📌 {pendingCourt?.name} · 팀 {pendingSlot.team} 배정 중
              </div>
              <div className="text-xs text-blue-500 mb-1.5">
                아래 선수를 탭하여 배정하세요
                {pendingCourt && (
                  <span className="ml-1">
                    ({pendingSlot.team === "A" ? pendingCourt.teamA.length : pendingCourt.teamB.length}/2명)
                  </span>
                )}
              </div>
              <button
                onClick={() => setPendingSlot(null)}
                className="text-xs text-blue-500 hover:text-blue-800 border border-blue-300 px-2 py-0.5 rounded"
              >
                ← 취소
              </button>
            </div>
          ) : (
            <div>
              <div className="text-lg font-bold text-gray-900">
                대기열
                <span className="text-gray-400 text-base font-normal ml-1.5">({availableQueue.length}명)</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                + 버튼으로 선수 배정
              </div>
            </div>
          )}
        </div>

        {/* 대기열 목록 - M/F 2컬럼 (드래그 가능) */}
        <div className="flex-1 overflow-y-auto p-2">
          {availableQueue.length === 0 ? (
            <div className="text-center text-gray-400 py-6 text-sm">
              {queue.length === 0 ? "대기 중인 선수 없음" : "모든 선수가 코트에 있습니다"}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {(["M", "F"] as const).map((gender) => {
                const isM = gender === "M";
                const localQ = isM ? localMaleQueue : localFemaleQueue;
                const draggingRef = isM ? maleDraggingRef : femaleDraggingRef;
                return (
                  <div key={gender}>
                    <div className={`text-xs font-bold mb-1 px-0.5 ${isM ? "text-blue-500" : "text-pink-500"}`}>
                      {isM ? "남" : "여"} ({localQ.length})
                    </div>
                    <DndContext
                      sensors={queueSensors}
                      collisionDetection={closestCenter}
                      onDragStart={() => { draggingRef.current = true; }}
                      onDragEnd={(e) => handleQueueDragEnd(e, gender)}
                      onDragCancel={() => { draggingRef.current = false; }}
                    >
                      <SortableContext items={localQ.map(e => e.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1">
                          {localQ.map((entry) => {
                            const overallIdx = availableQueue.findIndex(e => e.id === entry.id);
                            return (
                              <CourtQueueItem
                                key={entry.id}
                                entry={entry}
                                index={overallIdx}
                                player={getPlayer(entry.playerId)}
                                gender={gender}
                                onClick={() => handleAssign(entry)}
                                active={!!pendingSlot}
                              />
                            );
                          })}
                          {localQ.length === 0 && (
                            <div className="text-center text-gray-400 py-3 text-xs rounded-lg bg-gray-50/80">
                              없음
                            </div>
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>
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
                <span className="text-2xl font-bold text-gray-800">
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
                              gender === "M" ? "bg-blue-50 border-blue-300" : "bg-pink-50 border-pink-300"
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
