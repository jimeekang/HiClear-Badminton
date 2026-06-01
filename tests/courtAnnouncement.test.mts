import assert from "node:assert/strict";
import test from "node:test";
import { getCourtAnnouncement, getCourtsAnnouncement } from "../lib/courtAnnouncement.ts";

const players = [
  { id: "p1", name: "준호", gender: "M" as const, gamesPlayed: 0 },
  { id: "p2", name: "재아", gender: "F" as const, gamesPlayed: 0 },
  { id: "p3", name: "윤철", gender: "M" as const, gamesPlayed: 0 },
  { id: "p4", name: "혜지", gender: "F" as const, gamesPlayed: 0 },
  { id: "p5", name: "쉐인", gender: "M" as const, gamesPlayed: 0 },
  { id: "p6", name: "지미", gender: "F" as const, gamesPlayed: 0 },
];

test("builds one court announcement", () => {
  const text = getCourtAnnouncement(
    { id: "c1", name: "코트 15", teamA: ["p1", "p2"], teamB: ["p3", "p4"] },
    players
  );

  assert.equal(text, "십오번 코트 준호, 재아, 윤철, 혜지");
});

test("builds all ready court announcements and skips incomplete courts", () => {
  const text = getCourtsAnnouncement(
    [
      { id: "c1", name: "코트 15", teamA: ["p1", "p2"], teamB: ["p3", "p4"] },
      { id: "c2", name: "코트 16", teamA: ["p5", "p6"], teamB: [] },
    ],
    players
  );

  assert.equal(text, "전체 코트 안내입니다. 십오번 코트 준호, 재아, 윤철, 혜지");
});

test("uses the edited numeric court name when announcing", () => {
  const text = getCourtAnnouncement(
    { id: "c1", name: "24", teamA: ["p1", "p2"], teamB: ["p3", "p4"] },
    players
  );

  assert.equal(text, "이십사번 코트 준호, 재아, 윤철, 혜지");
});

test("uses the edited text court name when announcing", () => {
  const text = getCourtAnnouncement(
    { id: "c1", name: "메인", teamA: ["p1", "p2"], teamB: ["p3", "p4"] },
    players
  );

  assert.equal(text, "메인 코트 준호, 재아, 윤철, 혜지");
});

test("pronounces VIP1 and VIP2 in English", () => {
  const vip1 = getCourtAnnouncement(
    { id: "c1", name: "코트 VIP1", teamA: ["p1", "p2"], teamB: ["p3", "p4"] },
    players
  );
  const text = getCourtAnnouncement(
    { id: "c1", name: "코트 VIP2", teamA: ["p1", "p2"], teamB: ["p3", "p4"] },
    players
  );

  assert.equal(vip1, "VIP one 코트 준호, 재아, 윤철, 혜지");
  assert.equal(text, "VIP two 코트 준호, 재아, 윤철, 혜지");
});
