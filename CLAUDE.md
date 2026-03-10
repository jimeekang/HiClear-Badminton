# CLAUDE.md

Defines the rules, architecture constraints, and model policy for the Badminton Club Court Rotation App.

Claude Code must follow this document.

---

MODEL POLICY

Default model: Claude Sonnet

Use Sonnet for:

- planning
- coding
- debugging
- refactoring

Do not switch models unless explicitly requested.

Reason:
This project prioritizes low token usage and efficient development.

---

PROJECT PURPOSE

This project is a tablet-first web application for managing badminton club match rotations.

Typical club size: ~30 players.

Players rotate between courts using a queue.

Each match:

Team A (2 players)
Team B (2 players)

Preferred team format:

Male + Female vs Male + Female

However Male + Male teams are allowed.

---

TECH STACK

Next.js (App Router)
TypeScript
Firebase Firestore
Tailwind CSS
dnd-kit

Realtime updates must use Firestore onSnapshot.

---

DEVICE TARGET

Primary device: Tablet

UI requirements:

large buttons
simple layout
touch friendly

Recommended:

button height: 80px
font-size: 24px

---

SYSTEM MODULES

Players
Queue
Courts

Players enter the queue.

Courts host matches.

Game results rotate players.

---

GAME RULES

1. Game finishes
2. Manager selects winning team
3. Losing team → queue
4. Winning team stays
5. Two consecutive wins → winning team goes to queue
6. New players come from queue

---

COURT MANAGEMENT

Default courts: 6

Manager can:

Add court
Remove court

Add court:
Take next 4 players from queue.

Remove court:
Players return to queue.

---

DATABASE STRUCTURE

players

{
id: string
name: string
gender: "M" | "F"
gamesPlayed: number
}

queue

{
playerId: string
position: number
joinedAt: timestamp
}

courts

{
id: string
name: string
teamA: string[]
teamB: string[]
streakA: number
streakB: number
active: boolean
}

---

TOKEN EFFICIENCY RULES

Claude must minimize token usage.

Rules:

- Avoid long explanations
- Output concise code
- Do not repeat architecture
- Output only changed files
- Avoid regenerating full files
- Prefer incremental updates
- Minimal comments

---

END
