"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { usePlayers, useQueue, useCourts } from "@/hooks/useFirestore";
import CourtCard from "@/components/CourtCard";
import SessionSortableDnd from "@/components/SessionSortableDnd";
import { addCourt, resetAllPartnerIds } from "@/lib/db";
import { assignPlayerToCourt, reorderCourts } from "@/lib/courtOps";
import { reorderQueueEntries } from "@/lib/queue";
import {
  resetFirestoreSession,
  runFirestoreSessionMutation,
  runFirestoreSessionMutationWithScope,
} from "@/lib/firestoreSessionReset";
import {
  hasSessionStateToReset,
  runConfirmedSessionReset,
  type SessionMutationScope,
} from "@/lib/sessionReset";
import { getCourtAnnouncement, getCourtsAnnouncement } from "@/lib/courtAnnouncement";
import {
  canJoinTeam,
  finishGameResult,
  finishMatchHistoryReset,
  getPartnerResetReason,
  planAutoFill,
  runMatchHistoryResetSingleFlight,
  tryBeginGameResult,
  tryBeginMatchHistoryReset,
} from "@/lib/matchHistory";
import { useCourtVoice } from "@/hooks/useCourtVoice";
import { Court, Player, QueueEntry } from "@/types";
import { AppSnapshot, captureSnapshot, restoreSnapshot, sendAllCourtsToQueue } from "@/lib/snapshot";
import {
  closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  verticalListSortingStrategy, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function CourtQueueItem({ entry, index, genderIndex, player, gender, onClick, active, assignmentDisabled }: {
  entry: QueueEntry;
  index: number;
  genderIndex: number;
  player?: Player;
  gender: "M" | "F";
  onClick: () => void;
  active: boolean;
  assignmentDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const isDisabled = assignmentDisabled;
  const isNext = !active && genderIndex === 0;

  const bgClass = isDisabled
    ? "bg-gray-100 border border-gray-200 opacity-50 cursor-not-allowed"
    : active
    ? gender === "M"
      ? "bg-blue-50 border-2 border-blue-400 hover:bg-blue-100 active:scale-95 cursor-pointer"
      : "bg-pink-50 border-2 border-pink-400 hover:bg-pink-100 active:scale-95 cursor-pointer"
    : isNext
    ? gender === "M"
      ? "bg-blue-100 border-2 border-blue-500 shadow-sm"
      : "bg-pink-100 border-2 border-pink-500 shadow-sm"
    : gender === "M"
      ? "bg-blue-50/60 border border-blue-200"
      : "bg-pink-50/60 border border-pink-200";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, height: 44 }}
      onClick={active && !isDisabled ? onClick : undefined}
      className={`flex items-center rounded-lg transition-all ${bgClass}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex h-11 w-11 shrink-0 items-center gap-2.5 pl-1.5 pr-1 text-gray-300 cursor-grab active:cursor-grabbing select-none"
        style={{ touchAction: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <svg width="8" height="14" viewBox="0 0 16 24" fill="currentColor">
          <circle cx="5" cy="6" r="2" /><circle cx="11" cy="6" r="2" />
          <circle cx="5" cy="12" r="2" /><circle cx="11" cy="12" r="2" />
          <circle cx="5" cy="18" r="2" /><circle cx="11" cy="18" r="2" />
        </svg>
        <span className={`w-4 shrink-0 text-xs font-bold ${isNext ? "text-gray-600" : "text-gray-400"}`}>{index + 1}</span>
      </div>
      <span className={`flex-1 text-xs truncate ${isNext ? "font-bold text-gray-800" : "font-semibold"}`}>{player?.name ?? "..."}</span>
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
      onClick={(e) => { e.stopPropagation(); props.onActivate?.(); }}
    >
      <CourtCard
        {...props}
        dragHandle={
          <div
            {...attributes}
            {...listeners}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 hover:text-gray-200 cursor-grab active:cursor-grabbing select-none"
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

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [matchHistoryResetLoading, setMatchHistoryResetLoading] = useState(false);
  const [gameResultProcessingCount, setGameResultProcessingCount] = useState(0);
  const [resettingSession, setResettingSession] = useState(false);
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
  const autoResetKeyRef = useRef<string | null>(null);
  const matchHistoryResetStateRef = useRef({ current: null as Promise<void> | null });
  const matchHistoryOperationGateRef = useRef({ resetRequests: 0, activeGameResults: 0 });
  const fullSessionResetStateRef = useRef({ current: null as Promise<void> | null });
  const canResetSession = hasSessionStateToReset(queue, courts, players);

  const speakText = useCourtVoice();

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
    if (resettingSession) return;
    if (!over || active.id === over.id) return;
    const oldIdx = localCourts.findIndex((c) => c.id === active.id);
    const newIdx = localCourts.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(localCourts, oldIdx, newIdx);
    const request = reorderCourts(reordered);
    if (!request) return;
    await request;
    setLocalCourts(reordered);
  };

  const queueSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const saveSnapshot = useCallback(() => {
    setHistory((prev) => [...prev.slice(-9), captureSnapshot(courts, queue, players)]);
    setFuture([]);
  }, [courts, queue, players]);

  const runMatchHistoryReset = useCallback(async (
    beforeReset?: () => void,
    scope?: SessionMutationScope
  ) => {
    const gate = matchHistoryOperationGateRef.current;
    if (!tryBeginMatchHistoryReset(gate)) return false;

    setMatchHistoryResetLoading(true);
    try {
      let mutationAccepted = Boolean(matchHistoryResetStateRef.current.current);
      await runMatchHistoryResetSingleFlight(
        matchHistoryResetStateRef.current,
        async () => {
          const request = runFirestoreSessionMutationWithScope(scope, async () => {
            beforeReset?.();
            await resetAllPartnerIds();
          });
          if (!request) return;
          mutationAccepted = true;
          await request;
        }
      );
      return mutationAccepted;
    } finally {
      finishMatchHistoryReset(gate);
      if (gate.resetRequests === 0) {
        setMatchHistoryResetLoading(false);
      }
    }
  }, []);

  const handleGameResultStart = useCallback(() => {
    if (resettingSession) return false;
    const gate = matchHistoryOperationGateRef.current;
    if (!tryBeginGameResult(gate)) return false;
    setGameResultProcessingCount(gate.activeGameResults);
    return true;
  }, [resettingSession]);

  const handleGameResultEnd = useCallback(() => {
    const gate = matchHistoryOperationGateRef.current;
    finishGameResult(gate);
    setGameResultProcessingCount(gate.activeGameResults);
  }, []);

  const handleUndo = async () => {
    if (resettingSession || history.length === 0 || undoLoading || matchHistoryResetLoading || gameResultProcessingCount > 0) return;
    const prev = history[history.length - 1];
    const current = captureSnapshot(courts, queue, players);
    const request = restoreSnapshot(prev, courts);
    if (!request) return;
    setUndoLoading(true);
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [current, ...f.slice(0, 9)]);
    try { await request; } catch (e) { alert("되돌리기 실패"); }
    setUndoLoading(false);
  };

  const handleRedo = async () => {
    if (resettingSession || future.length === 0 || undoLoading || matchHistoryResetLoading || gameResultProcessingCount > 0) return;
    const next = future[0];
    const current = captureSnapshot(courts, queue, players);
    const request = restoreSnapshot(next, courts);
    if (!request) return;
    setUndoLoading(true);
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h.slice(-9), current]);
    try { await request; } catch (e) { alert("다시실행 실패"); }
    setUndoLoading(false);
  };

  const handleResetPartners = async () => {
    if (
      resettingSession ||
      matchHistoryResetLoading ||
      gameResultProcessingCount > 0 ||
      !confirm("모든 선수의 매칭 기록을 초기화하시겠습니까?\n(전체 게임 종료 후 새 세션 시작 시 사용)")
    ) return;
    try {
      const resetStarted = await runMatchHistoryReset(saveSnapshot);
      if (!resetStarted) {
        showToast("경기 결과 처리 후 다시 시도해 주세요.");
        return;
      }
      showToast("매칭 기록이 초기화되었습니다.");
    } catch (e) {
      console.error(e);
      showToast("초기화 중 오류가 발생했습니다.");
    }
  };

  const handleResetSession = async () => {
    const request = runConfirmedSessionReset(
      fullSessionResetStateRef.current,
      canResetSession,
      () => confirm(
        "대기열과 모든 코트의 선수 배치, 모든 선수의 매칭 기록을 초기화하시겠습니까?\n선수 등록 정보와 코트는 유지됩니다."
      ),
      resetFirestoreSession,
      () => {
        setHistory([]);
        setFuture([]);
        setPendingSlot(null);
        setActiveCourtId(null);
        setShowAddForm(false);
        setCourtNumber("");
        autoResetKeyRef.current = null;
      }
    );
    if (!request) return;

    setResettingSession(true);
    try {
      await request;
      alert("대기열, 코트 배치, 매칭 기록을 모두 초기화했습니다.");
    } catch (error) {
      console.error("전체 초기화 실패:", error);
      alert("전체 초기화에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setResettingSession(false);
    }
  };

  const handleSendAllToQueue = async () => {
    if (resettingSession) return;
    const total = courts.reduce((n, c) => n + c.teamA.length + c.teamB.length, 0);
    if (total === 0) { alert("코트에 선수가 없습니다."); return; }
    if (!confirm(`모든 코트의 선수 ${total}명을 대기열로 보내시겠습니까?`)) return;
    const request = sendAllCourtsToQueue(courts);
    if (!request) return;
    saveSnapshot();
    try { await request; } catch (e) { alert("오류가 발생했습니다."); }
  };

  const getPlayer = (id: string) => players.find((p) => p.id === id);

  const speakAnnouncement = (text: string | null, emptyMessage: string) => {
    if (!text) {
      showToast(emptyMessage);
      return;
    }

    if (!speakText(text)) {
      showToast("이 브라우저는 음성 안내를 지원하지 않습니다.");
      return;
    }

    showToast("음성 안내 중입니다.");
  };

  const handleAnnounceAllCourts = () => {
    speakAnnouncement(getCourtsAnnouncement(localCourts, players), "안내할 완성 코트가 없습니다.");
  };

  const handleAnnounceCourt = (court: Court) => {
    speakAnnouncement(getCourtAnnouncement(court, players), "양 팀 2명씩 배정된 코트만 안내할 수 있습니다.");
  };

  // 코트에 이미 있는 선수는 대기열 패널에서 제외
  const availableQueue = useMemo(() => {
    const courtPlayerIds = new Set(courts.flatMap((court) => [...court.teamA, ...court.teamB]));
    return queue.filter((entry) => !courtPlayerIds.has(entry.playerId));
  }, [courts, queue]);

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
    if (resettingSession) return;
    if (!over || active.id === over.id) return;

    const localQ = isM ? localMaleQueue : localFemaleQueue;
    const setLocalQ = isM ? setLocalMaleQueue : setLocalFemaleQueue;
    const oldIdx = localQ.findIndex(e => e.id === active.id);
    const newIdx = localQ.findIndex(e => e.id === over.id);
    const reordered = arrayMove(localQ, oldIdx, newIdx);

    let gIdx = 0;
    const merged = availableQueue.map(entry => {
      const p = players.find(p => p.id === entry.playerId);
      return p?.gender === gender ? reordered[gIdx++] : entry;
    });
    const request = reorderQueueEntries(merged);
    if (!request) return;
    await request;
    setLocalQ(reordered);
  };

  const handleAutoFill = async () => {
    if (resettingSession || autoFillLoading || matchHistoryResetLoading || gameResultProcessingCount > 0) return;
    const emptyCourts = localCourts.filter((c) => c.teamA.length < 2 || c.teamB.length < 2);
    if (emptyCourts.length === 0) { showToast("빈 슬롯이 있는 코트가 없습니다."); return; }

    const autoFillQueue = {
      M: localMaleQueue.map(({ id, playerId }) => ({ id, playerId })),
      F: localFemaleQueue.map(({ id, playerId }) => ({ id, playerId })),
    };
    let plan = planAutoFill(emptyCourts, autoFillQueue, players);
    if (plan.assignments.length === 0 && !plan.needsHistoryReset) {
      showToast("배정 가능한 선수가 없습니다.");
      return;
    }

    const request = runFirestoreSessionMutation(async (scope) => {
      let historyReset = false;
      let snapshotSaved = false;

      if (plan.needsHistoryReset) {
        const resetStarted = await runMatchHistoryReset(saveSnapshot, scope);
        if (!resetStarted) {
          showToast("경기 결과 처리 후 자동 배정을 다시 시도해 주세요.");
          return;
        }
        snapshotSaved = true;
        historyReset = true;
        const clearedPlayers = players.map((player) => ({
          ...player,
          lastPartnerIds: [],
          partnerIds: [],
          opponentIds: [],
        }));
        plan = planAutoFill(emptyCourts, autoFillQueue, clearedPlayers);
      }

      if (plan.assignments.length === 0) {
        showToast("필요한 성별 선수가 없어 매칭 기록을 자동 초기화했습니다.");
        return;
      }

      if (!snapshotSaved) saveSnapshot();
      for (const assignment of plan.assignments) {
        const court = emptyCourts.find((candidate) => candidate.id === assignment.courtId);
        if (!court) continue;
        await assignPlayerToCourt(
          court,
          assignment.team,
          assignment.playerId,
          assignment.entryId,
          scope
        );
      }
      const skipped = plan.totalSlots - plan.assignments.length;
      const resetNotice = historyReset ? " · 매칭 기록 자동 초기화" : "";
      showToast(
        skipped > 0
          ? plan.needsHistoryReset
            ? `${plan.assignments.length}명 배정 완료 (필요한 성별 선수 부족으로 ${skipped}개 슬롯 미배정)${resetNotice}`
            : `${plan.assignments.length}명 배정 완료 (${skipped}개 슬롯 미배정)${resetNotice}`
          : `${plan.assignments.length}명 자동 배정 완료${resetNotice}`
      );
    });
    if (!request) return;

    setAutoFillLoading(true);
    try {
      await request;
    } catch (error) {
      console.error(error);
      showToast("자동 배정 중 오류가 발생했습니다.");
    } finally {
      setAutoFillLoading(false);
    }
  };

  const handleAddCourt = async () => {
    if (resettingSession) return;
    const name = courtNumber.trim();
    if (!name) return;
    const request = runFirestoreSessionMutation(() => addCourt(`코트 ${name}`));
    if (!request) return;
    await request;
    setCourtNumber("");
    setShowAddForm(false);
  };

  const handleSlotClick = (courtId: string, team: "A" | "B") => {
    if (resettingSession) return;
    const court = courts.find((c) => c.id === courtId);
    if (!court) return;
    setActiveCourtId(courtId);
    const teamPlayers = team === "A" ? court.teamA : court.teamB;
    if (teamPlayers.length >= 2) return;
    setPendingSlot({ courtId, team });
  };

  const handleAssign = async (entry: QueueEntry) => {
    if (resettingSession || !pendingSlot) return;
    const court = courts.find((c) => c.id === pendingSlot.courtId);
    if (!court) return;

    const currentTeam = pendingSlot.team === "A" ? court.teamA : court.teamB;
    // 이미 2명이면 패널 닫고 중단
    if (currentTeam.length >= 2) {
      setPendingSlot(null);
      return;
    }

    const player = getPlayer(entry.playerId);
    if (!canJoinTeam(player, court, pendingSlot.team, players)) {
      const currentPartner = currentTeam.length === 1 ? getPlayer(currentTeam[0]) : undefined;
      showToast(
        currentPartner?.gender === player?.gender
          ? "반대 성별 선수만 파트너로 추가할 수 있습니다."
          : "이미 같은 편 또는 상대편으로 만난 선수입니다."
      );
      return;
    }

    const request = assignPlayerToCourt(court, pendingSlot.team, entry.playerId, entry.id);
    if (!request) return;
    saveSnapshot();
    await request;

    // 배정 후 팀이 찼으면 패널 닫기
    if (currentTeam.length + 1 >= 2) {
      setPendingSlot(null);
    }
  };

  const pendingCourt = courts.find((c) => c.id === pendingSlot?.courtId);
  const isAssignmentDisabled = (entry: QueueEntry) => {
    if (resettingSession) return true;
    if (!pendingSlot || !pendingCourt) return false;
    return !canJoinTeam(getPlayer(entry.playerId), pendingCourt, pendingSlot.team, players);
  };

  useEffect(() => {
    if (!pendingSlot || !pendingCourt) {
      autoResetKeyRef.current = null;
      return;
    }

    const teamPlayers = pendingSlot.team === "A" ? pendingCourt.teamA : pendingCourt.teamB;
    if (teamPlayers.length >= 2) {
      setPendingSlot(null);
      return;
    }

    const candidates = availableQueue
      .map((entry) => getPlayer(entry.playerId))
      .filter((player): player is Player => Boolean(player));
    const resetReason = getPartnerResetReason(
      candidates,
      pendingCourt,
      pendingSlot.team,
      players
    );

    if (!resetReason || resettingSession || gameResultProcessingCount > 0) return;

    const resetKey = `${pendingSlot.courtId}:${pendingSlot.team}:${teamPlayers.join(",")}:${resetReason}`;
    if (autoResetKeyRef.current === resetKey) return;
    autoResetKeyRef.current = resetKey;

    void (async () => {
      try {
        const resetStarted = await runMatchHistoryReset(saveSnapshot);
        if (!resetStarted) {
          autoResetKeyRef.current = null;
          return;
        }
        showToast(
          resetReason === "required-gender-missing"
            ? "필요한 성별 선수가 없어 매칭 기록을 자동 초기화했습니다."
            : "추가 가능한 선수가 없어 매칭 기록을 자동 초기화했습니다."
        );
      } catch (error) {
        autoResetKeyRef.current = null;
        console.error(error);
        showToast("매칭 기록 자동 초기화 중 오류가 발생했습니다.");
      }
    })();
  }, [pendingCourt, pendingSlot, availableQueue, players, saveSnapshot, runMatchHistoryReset, resettingSession, gameResultProcessingCount]);

  return (
    <div className="flex" style={{ height: "calc(100vh - 72px)" }} onClick={() => setActiveCourtId(null)}>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-base font-semibold px-6 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}
      {/* 메인 코트 영역 */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* 헤더 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h1 className="text-2xl font-bold">코트</h1>
          <span className="text-lg text-gray-400">({courts.length}개)</span>
          <button
            onClick={() => { setShowAddForm((v) => !v); setCourtNumber(""); }}
            disabled={resettingSession}
            className="bg-blue-500 text-white px-4 rounded-lg font-bold text-base hover:bg-blue-600 transition-colors ml-2"
            style={{ height: 44 }}
          >
            + 코트 추가
          </button>
          <button
            onClick={handleAutoFill}
            disabled={resettingSession || autoFillLoading || matchHistoryResetLoading || gameResultProcessingCount > 0}
            className="bg-violet-500 text-white px-4 rounded-lg font-bold text-base hover:bg-violet-600 disabled:opacity-40 transition-colors"
            style={{ height: 44 }}
          >
            {autoFillLoading ? "배정 중..." : "자동 넣기"}
          </button>
          <button
            onClick={handleAnnounceAllCourts}
            className="px-3 rounded-lg font-bold text-base border border-gray-300 bg-white hover:bg-gray-100 transition-colors text-gray-700"
            style={{ height: 44 }}
          >
            전체 음성안내
          </button>
          <button
            onClick={handleSendAllToQueue}
            disabled={resettingSession}
            className="bg-blue-700 text-white px-4 rounded-lg font-bold text-base hover:bg-blue-800 disabled:opacity-40 transition-colors"
            style={{ height: 44 }}
          >
            전체 대기열로
          </button>
          <button
            onClick={handleUndo}
            disabled={resettingSession || history.length === 0 || undoLoading || matchHistoryResetLoading || gameResultProcessingCount > 0}
            title="되돌리기"
            className="px-3 rounded-lg font-bold text-base border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-30 transition-colors text-gray-600"
            style={{ height: 44 }}
          >
            ↩ 되돌리기
          </button>
          <button
            onClick={handleRedo}
            disabled={resettingSession || future.length === 0 || undoLoading || matchHistoryResetLoading || gameResultProcessingCount > 0}
            title="다시실행"
            className="px-3 rounded-lg font-bold text-base border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-30 transition-colors text-gray-600"
            style={{ height: 44 }}
          >
            ↪ 다시실행
          </button>
          <button
            onClick={handleResetPartners}
            disabled={resettingSession || matchHistoryResetLoading || gameResultProcessingCount > 0}
            title="전체 게임 종료 후 매칭 기록 초기화"
            className="px-3 rounded-lg font-bold text-base border border-orange-300 bg-white hover:bg-orange-50 disabled:opacity-30 transition-colors text-orange-500"
            style={{ height: 44 }}
          >
            {matchHistoryResetLoading ? "초기화 중..." : "매칭 초기화"}
          </button>
          <button
            onClick={handleResetSession}
            disabled={!canResetSession || resettingSession}
            title="대기열, 코트 배치, 매칭 기록 전체 초기화"
            className="px-3 rounded-lg font-bold text-base bg-red-500 text-white hover:bg-red-600 disabled:opacity-30 transition-colors"
            style={{ height: 44 }}
          >
            {resettingSession ? "초기화 중..." : "전체 초기화"}
          </button>
        </div>

        {/* 코트 번호 입력 폼 */}
        {showAddForm && (
          <div className="flex items-center gap-2 mb-3 p-3 bg-white rounded-lg shadow border border-blue-200">
            <span className="text-base font-semibold text-gray-600 whitespace-nowrap">코트 번호:</span>
            <input
              type="text"
              disabled={resettingSession}
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
              disabled={resettingSession || !courtNumber.trim()}
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
          <SessionSortableDnd
            sensors={courtSensors}
            disabled={resettingSession}
            items={localCourts.map((c) => c.id)}
            strategy={rectSortingStrategy}
            collisionDetection={closestCenter}
            onDragStart={() => { if (!resettingSession) courtDraggingRef.current = true; }}
            onDragEnd={handleCourtDragEnd}
            onDragCancel={() => { courtDraggingRef.current = false; }}
          >
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))" }}
            >
              {localCourts.map((court) => (
                <SortableCourtCard
                  key={court.id}
                  court={court}
                  players={players}
                  queue={queue}
                  onSlotClick={handleSlotClick}
                  isActive={activeCourtId === court.id}
                  onBeforeAction={saveSnapshot}
                  onActivate={() => setActiveCourtId(court.id)}
                  onAnnounce={() => handleAnnounceCourt(court)}
                  mutationDisabled={resettingSession}
                  resultDisabled={resettingSession || matchHistoryResetLoading}
                  onResultStart={handleGameResultStart}
                  onResultEnd={handleGameResultEnd}
                />
              ))}
            </div>
          </SessionSortableDnd>
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
                    <SessionSortableDnd
                      sensors={queueSensors}
                      disabled={resettingSession}
                      items={localQ.map((entry) => entry.id)}
                      strategy={verticalListSortingStrategy}
                      collisionDetection={closestCenter}
                      onDragStart={() => { if (!resettingSession) draggingRef.current = true; }}
                      onDragEnd={(e) => handleQueueDragEnd(e, gender)}
                      onDragCancel={() => { draggingRef.current = false; }}
                    >
                      <div className="space-y-1">
                        {localQ.map((entry, genderIdx) => {
                          const overallIdx = availableQueue.findIndex(e => e.id === entry.id);
                          return (
                            <CourtQueueItem
                              key={entry.id}
                              entry={entry}
                              index={overallIdx}
                              genderIndex={genderIdx}
                              player={getPlayer(entry.playerId)}
                              gender={gender}
                              onClick={() => handleAssign(entry)}
                              active={!!pendingSlot && !resettingSession}
                              assignmentDisabled={isAssignmentDisabled(entry)}
                            />
                          );
                        })}
                        {localQ.length === 0 && (
                          <div className="text-center text-gray-400 py-3 text-xs rounded-lg bg-gray-50/80">
                            없음
                          </div>
                        )}
                      </div>
                    </SessionSortableDnd>
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
                        const assignmentDisabled = isAssignmentDisabled(entry);
                        return (
                          <button
                            key={entry.id}
                            onClick={() => handleAssign(entry)}
                            disabled={assignmentDisabled}
                            className={`w-full flex items-center gap-3 border-2 rounded-xl px-3 transition-all ${
                              assignmentDisabled
                                ? "bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed"
                                : gender === "M"
                                ? "bg-blue-50 border-blue-300 hover:opacity-80 active:scale-95"
                                : "bg-pink-50 border-pink-300 hover:opacity-80 active:scale-95"
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
