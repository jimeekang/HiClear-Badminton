import { Timestamp } from "firebase/firestore";

export interface Player {
  id: string;
  name: string;
  gender: "M" | "F";
  gamesPlayed: number;
}

export interface QueueEntry {
  id: string;
  playerId: string;
  position: number;
  joinedAt: Timestamp;
}

export interface Court {
  id: string;
  name: string;
  teamA: string[];
  teamB: string[];
  gamesA?: number;
  gamesB?: number;
  order?: number;
}
