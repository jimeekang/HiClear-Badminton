# QA Testing Memory - HiClear Badminton

## Project Overview
- Badminton club court rotation app (tablet-first)
- Tech: Next.js App Router + TypeScript + Firebase Firestore + Tailwind CSS + dnd-kit
- 3 pages: /courts, /queue, /players (root redirects to /courts)

## Key Architecture Notes
- Realtime via Firestore onSnapshot in hooks/useFirestore.ts
- Queue position uses Date.now() as ordering value
- Game rules: loser to queue, winner stays (max 2 consecutive wins)
- Each court: teamA[2] + teamB[2] with streakA/streakB counters

## Known Bug Patterns (from 2026-03-10 audit)
- **Cascade deletion missing**: deletePlayer only removes player doc, leaves orphans in queue/courts
- **No queue count validation**: processGameResult doesn't check if enough players in queue before pulling
- **Race condition in game result**: losers pushed to queue can be immediately re-pulled in streak>=2 scenario
- **Stale state in handleAssign**: courts/page.tsx uses pre-await court state to check slot capacity
- **Position value mismatch**: QueueList shows raw Date.now() timestamp instead of sequential index
- **Dead code**: components/PlayerList.tsx and PlayerSearch.tsx are unused

## Testing Conventions
- All source in: app/, components/, hooks/, lib/, types/
- 15 source files total (small codebase)
- No test framework configured (no test files found)
- TypeScript strict mode via tsconfig
