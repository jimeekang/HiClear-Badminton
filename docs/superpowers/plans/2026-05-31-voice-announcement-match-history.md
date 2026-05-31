# Voice Announcement Match History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코트 배정 완료 시 음성으로 안내하고, 같은 파트너/상대팀 중복 매칭을 막는다.

**Architecture:** 브라우저 Web Speech API로 클라이언트에서만 음성을 재생한다. 매칭 중복 방지는 Firestore `players` 문서에 누적 파트너/상대 이력을 저장하고, 수동 배정/자동 넣기/결과 처리 흐름에서 같은 판정 함수를 사용한다.

**Tech Stack:** Next.js App Router, TypeScript, Firebase Firestore, React hooks, Web Speech API.

---

## 제안

- 음성 안내는 별도 유료 API 없이 `window.speechSynthesis`를 사용한다.
- 브라우저 정책 때문에 코트 화면에 `음성 ON/OFF` 버튼을 둔다. 사용자가 한 번 켜면 `localStorage`에 저장한다.
- 안내 시점은 한 코트가 4명으로 완성되는 순간이다.
- 안내 문구 예시: `1번 코트, 김민수 이지은 대 박철수 최서연, 들어가세요.`
- 중복 매칭은 기본적으로 강하게 차단한다.
- 가능한 선수가 없으면 자동 넣기는 해당 슬롯을 비우고 토스트로 미배정 수를 보여준다.
- 전체 게임 종료 후 새 세션을 시작할 때 `파트너 초기화` 버튼이 파트너/상대 이력을 모두 초기화한다.

## 변경 파일 구조

- Modify: `types/index.ts`
  - `Player.partnerIds`, `Player.opponentIds` 추가.
- Modify: `lib/db.ts`
  - 신규 선수 기본 이력 필드 추가.
  - 이력 초기화 함수를 파트너/상대 모두 초기화하도록 변경.
- Create: `lib/matchHistory.ts`
  - 파트너/상대 충돌 판정 공통 함수.
- Modify: `lib/game.ts`
  - 경기 종료 시 파트너/상대 이력 누적 저장.
- Create: `hooks/useCourtVoice.ts`
  - 코트 완성 상태 감지 및 음성 안내.
- Modify: `app/courts/page.tsx`
  - 음성 토글 UI 추가.
  - 수동/자동 배정에서 중복 매칭 차단 함수 적용.
- Test: `npm run build`

---

### Task 1: Player Match History Schema

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: Add history fields to Player type**

`types/index.ts`의 `Player`에 아래 필드를 추가한다.

```ts
export interface Player {
  id: string;
  name: string;
  gender: "M" | "F";
  gamesPlayed: number;
  lastPartnerIds?: string[];
  partnerIds?: string[];
  opponentIds?: string[];
}
```

- [ ] **Step 2: Initialize history fields for new players**

`lib/db.ts`의 `addPlayer`에서 신규 선수 생성 데이터를 아래처럼 변경한다.

```ts
const ref = await addDoc(collection(db, "players"), {
  name,
  gender,
  gamesPlayed: 0,
  lastPartnerIds: [],
  partnerIds: [],
  opponentIds: [],
});
```

- [ ] **Step 3: Reset both partner and opponent history**

`resetAllPartnerIds`는 이름은 유지하고 동작만 확장한다.

```ts
snap.docs.forEach((d) =>
  batch.update(d.ref, {
    lastPartnerIds: [],
    partnerIds: [],
    opponentIds: [],
  })
);
```

- [ ] **Step 4: Verify**

Run: `npm run build`

Expected: TypeScript build passes.

---

### Task 2: Shared Match Conflict Helper

**Files:**
- Create: `lib/matchHistory.ts`
- Modify: `app/courts/page.tsx`

- [ ] **Step 1: Create helper file**

Create `lib/matchHistory.ts`.

```ts
import { Court, Player } from "@/types";

export type MatchConflictReason = "partner" | "opponent" | null;

export function getPlayerById(players: Player[], id: string): Player | undefined {
  return players.find((p) => p.id === id);
}

export function getCourtPlayerIds(court: Court): string[] {
  return [...court.teamA, ...court.teamB];
}

export function checkMatchConflict(
  player: Player | undefined,
  courtPlayerIds: string[]
): MatchConflictReason {
  if (!player) return null;

  const partnerIds = new Set([...(player.partnerIds ?? []), ...(player.lastPartnerIds ?? [])]);
  const opponentIds = new Set(player.opponentIds ?? []);

  if (courtPlayerIds.some((id) => partnerIds.has(id))) return "partner";
  if (courtPlayerIds.some((id) => opponentIds.has(id))) return "opponent";
  return null;
}

export function canJoinCourt(
  player: Player | undefined,
  court: Court,
  plannedPlayerIds: string[] = []
): boolean {
  return checkMatchConflict(player, [...getCourtPlayerIds(court), ...plannedPlayerIds]) === null;
}
```

- [ ] **Step 2: Replace local conflict checks**

`app/courts/page.tsx`에서 `checkRecentMatch`와 자동 넣기 내부 충돌 계산을 `checkMatchConflict`, `canJoinCourt`로 바꾼다.

```ts
import { canJoinCourt, checkMatchConflict } from "@/lib/matchHistory";
```

- [ ] **Step 3: Verify**

Run: `npm run build`

Expected: TypeScript build passes.

---

### Task 3: Persist Partner And Opponent History

**Files:**
- Modify: `lib/game.ts`

- [ ] **Step 1: Import arrayUnion**

```ts
import { doc, collection, writeBatch, increment, serverTimestamp, arrayUnion } from "firebase/firestore";
```

- [ ] **Step 2: Update player history after every completed game**

현재 `gamesPlayed +1` 블록을 아래 형태로 교체한다.

```ts
[
  { team: court.teamA, opponents: court.teamB },
  { team: court.teamB, opponents: court.teamA },
].forEach(({ team, opponents }) => {
  team.forEach((pid, i) => {
    const partner = team[1 - i];
    batch.update(doc(db, "players", pid), {
      gamesPlayed: increment(1),
      lastPartnerIds: partner ? [partner] : [],
      ...(partner ? { partnerIds: arrayUnion(partner) } : {}),
      opponentIds: arrayUnion(...opponents),
    });
  });
});
```

- [ ] **Step 3: Verify existing result rules**

Run: `npm run build`

Expected: Build passes and `processGameResult` still keeps winner or sends both teams to queue according to streak.

---

### Task 4: Enforce Conflict Rules In Assignment

**Files:**
- Modify: `app/courts/page.tsx`

- [ ] **Step 1: Block manual assignment**

`handleAssign`에서 `assignPlayerToCourt` 호출 전에 충돌을 검사한다.

```ts
const player = getPlayer(entry.playerId);
if (!canJoinCourt(player, court)) {
  showToast("이미 같은 편 또는 상대편으로 만난 선수입니다.");
  return;
}
```

- [ ] **Step 2: Disable conflicted queue items**

`checkRecentMatch`를 아래처럼 변경한다.

```ts
const checkRecentMatch = (entry: QueueEntry) => {
  if (!pendingSlot || !pendingCourt) return false;
  return checkMatchConflict(getPlayer(entry.playerId), [
    ...pendingCourt.teamA,
    ...pendingCourt.teamB,
  ]) !== null;
};
```

- [ ] **Step 3: Apply same rule to auto fill**

자동 넣기 후보 선택에서 기존 `lastPartnerIds` 직접 비교를 제거하고 아래 판정만 사용한다.

```ts
const plannedIds = assignments
  .filter((a) => a.court.id === court.id)
  .map((a) => a.playerId);

if (canJoinCourt(player, court, plannedIds)) {
  assignments.push({ court, team, playerId: entry.playerId, entryId: entry.id });
  usedIds.add(entry.playerId);
  break;
}
```

- [ ] **Step 4: Verify**

Run: `npm run build`

Expected: Build passes. Manual and auto assignment use the same conflict rule.

---

### Task 5: Voice Announcement Hook

**Files:**
- Create: `hooks/useCourtVoice.ts`
- Modify: `app/courts/page.tsx`

- [ ] **Step 1: Create voice hook**

Create `hooks/useCourtVoice.ts`.

```ts
"use client";

import { useEffect, useRef } from "react";
import { Court, Player } from "@/types";

function getName(players: Player[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? "";
}

function courtLabel(name: string): string {
  const number = name.match(/\d+/)?.[0];
  return number ? `${number}번 코트` : name;
}

export function useCourtVoice(courts: Court[], players: Player[], enabled: boolean) {
  const spokenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;

    courts.forEach((court) => {
      if (court.teamA.length !== 2 || court.teamB.length !== 2) return;

      const key = `${court.id}:${court.teamA.join(",")}:${court.teamB.join(",")}`;
      if (spokenRef.current.has(key)) return;

      spokenRef.current.add(key);

      const teamA = court.teamA.map((id) => getName(players, id)).filter(Boolean).join(" ");
      const teamB = court.teamB.map((id) => getName(players, id)).filter(Boolean).join(" ");
      const text = `${courtLabel(court.name)}, ${teamA} 대 ${teamB}, 들어가세요.`;

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    });
  }, [courts, players, enabled]);
}
```

- [ ] **Step 2: Add voice state to courts page**

`app/courts/page.tsx`에 상태와 훅 호출을 추가한다.

```ts
const [voiceEnabled, setVoiceEnabled] = useState(false);

useEffect(() => {
  setVoiceEnabled(localStorage.getItem("courtVoiceEnabled") === "true");
}, []);

useCourtVoice(courts, players, voiceEnabled);
```

- [ ] **Step 3: Add toggle button**

코트 페이지 헤더 버튼 영역에 추가한다.

```tsx
<button
  onClick={() => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    localStorage.setItem("courtVoiceEnabled", String(next));
    showToast(next ? "음성 안내 켜짐" : "음성 안내 꺼짐");
  }}
  className="px-3 rounded-lg font-bold text-base border border-gray-300 bg-white hover:bg-gray-100 transition-colors text-gray-700"
  style={{ height: 40 }}
>
  {voiceEnabled ? "음성 ON" : "음성 OFF"}
</button>
```

- [ ] **Step 4: Verify**

Run: `npm run build`

Expected: Build passes. Browser console has no server-side `window` error.

---

### Task 6: Manual QA

**Files:**
- No code files.

- [ ] **Step 1: Start app**

Run: `npm run dev`

Expected: App starts on `http://localhost:3000`.

- [ ] **Step 2: Test voice**

1. Open `/courts`.
2. Turn `음성 ON`.
3. Fill a court with 4 players.
4. Expected: one announcement is spoken for that completed court.
5. Remove and reassign a different player.
6. Expected: new court composition is announced once.

- [ ] **Step 3: Test partner duplicate block**

1. Put A/B as same team and C/D as opponent team.
2. Finish the game.
3. Try to assign A with B again.
4. Expected: B is disabled or blocked with toast.

- [ ] **Step 4: Test opponent duplicate block**

1. After A/B vs C/D is recorded, try to put A on a court already containing C or D.
2. Expected: A is disabled or blocked with toast.

- [ ] **Step 5: Test reset**

1. Click `파트너 초기화`.
2. Try the same combinations again.
3. Expected: previous partner/opponent restrictions are cleared.

---

## Risks

- 누적 이력이 많아지면 특정 세션 후반에는 가능한 조합이 부족할 수 있다.
- Firestore 배열 필드가 커질 수 있으므로 클럽 세션 단위로 초기화하는 현재 운영 방식이 적합하다.
- `speechSynthesis`는 브라우저/태블릿 음량/무음 모드 영향을 받는다.

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-05-31-voice-announcement-match-history.md`.

Two execution options:

1. Subagent-Driven (recommended) - task별 fresh subagent 실행 후 검토
2. Inline Execution - 현재 세션에서 순서대로 구현
