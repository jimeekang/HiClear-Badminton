# TASKS.md

Development tasks for the Badminton Club Rotation App.

---

PHASE 1

Project Setup

- Create Next.js project
- Install Tailwind
- Setup Firebase
- Setup Firestore

---

PHASE 2

Database Layer

Implement collections:

players
queue
courts

Create TypeScript types.

---

PHASE 3

Queue Logic

Implement:

addPlayerToQueue

pushTeamToQueue

getNextPlayersFromQueue

removePlayersFromQueue

---

PHASE 4

Game Logic

Implement:

processGameResult

Rules:

loser → queue

winner streak++

2 wins → winner queue

---

PHASE 5

UI Components

Create:

CourtCard

QueueList

PlayerSearch

PlayerList

---

PHASE 6

Realtime Updates

Add Firestore listeners.

---

PHASE 7

Drag & Drop

Use dnd-kit.

Features:

Queue reorder

Gender switch

---

PHASE 8

Tablet Optimization

Large buttons

Touch-friendly UI

---

PHASE 9

Extra Features

Track gamesPlayed.

Add AUTO FILL COURTS.

---

END
