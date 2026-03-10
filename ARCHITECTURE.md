# ARCHITECTURE.md

Defines the technical architecture of the Badminton Court Rotation App.

---

SYSTEM OVERVIEW

Players join queue → courts host games → results rotate players.

Flow:

Players
↓
Queue
↓
Courts
↓
Game Result
↓
Queue Rotation

---

COURT STRUCTURE

Each court contains:

Team A (2 players)
Team B (2 players)

Example:

Court 1

Team A
Player1
Player2

Team B
Player3
Player4

---

GAME RESULT FLOW

Example:

Team A wins.

Team B → queue

Team A streak +1

If streak == 2

Team A → queue

Replace with next 4 players.

Else:

Next 2 queue players form new Team B.

---

QUEUE SYSTEM

Queue stores players individually.

But teams move together.

Queue operations:

pushTeamToQueue(players)

getNextPlayersFromQueue(count)

removePlayersFromQueue(count)

---

REALTIME ARCHITECTURE

Firestore listeners for:

players
queue
courts

UI updates automatically.

---

FRONTEND STRUCTURE

Next.js App Router.

Pages:

/courts
/players
/queue

Components:

CourtCard
QueueList
PlayerSearch
PlayerList

---

STATE FLOW

Firestore → Listener → React state → UI

---

END
