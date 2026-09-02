import assert from "node:assert/strict";
import test from "node:test";
import * as matchHistory from "../lib/matchHistory.ts";

const { canJoinTeam, checkAssignmentConflict } = matchHistory;

test("blocks a repeated partner on the same team", () => {
  const result = checkAssignmentConflict(
    { id: "p1", name: "A", gender: "M", gamesPlayed: 0, partnerIds: ["p2"] },
    ["p2"],
    []
  );

  assert.equal(result, "partner");
});

test("blocks a repeated opponent on the opposite team", () => {
  const result = checkAssignmentConflict(
    { id: "p1", name: "A", gender: "M", gamesPlayed: 0, opponentIds: ["p3"] },
    [],
    ["p3"]
  );

  assert.equal(result, "opponent");
});

test("allows a former partner on the opposite team when they were not an opponent", () => {
  const result = checkAssignmentConflict(
    { id: "p1", name: "A", gender: "M", gamesPlayed: 0, partnerIds: ["p2"] },
    [],
    ["p2"]
  );

  assert.equal(result, null);
});

test("blocks a same-gender player from filling a partner slot", () => {
  const players = [
    { id: "m1", name: "A", gender: "M" as const, gamesPlayed: 0 },
    { id: "m2", name: "B", gender: "M" as const, gamesPlayed: 0 },
  ];
  const court = { id: "c1", name: "Court 1", teamA: ["m1"], teamB: [] };

  const result = canJoinTeam(players[1], court, "A", players);

  assert.equal(result, false);
});

test("blocks a partner assignment when the current teammate record is missing", () => {
  const player = { id: "m2", name: "B", gender: "M" as const, gamesPlayed: 0 };
  const court = { id: "c1", name: "Court 1", teamA: ["missing-m1"], teamB: [] };

  const result = canJoinTeam(player, court, "A", [player]);

  assert.equal(result, false);
});

test("requests a reset when the required partner gender is missing", () => {
  const players = [
    { id: "m1", name: "A", gender: "M" as const, gamesPlayed: 0 },
    { id: "m2", name: "B", gender: "M" as const, gamesPlayed: 0 },
  ];
  const court = { id: "c1", name: "Court 1", teamA: ["m1"], teamB: [] };

  const result = matchHistory.getPartnerResetReason([players[1]], court, "A", players);

  assert.equal(result, "required-gender-missing");
});

test("requests a reset when every required-gender partner is blocked by match history", () => {
  const players = [
    { id: "m1", name: "A", gender: "M" as const, gamesPlayed: 0 },
    { id: "f1", name: "B", gender: "F" as const, gamesPlayed: 0, partnerIds: ["m1"] },
  ];
  const court = { id: "c1", name: "Court 1", teamA: ["m1"], teamB: [] };

  const result = matchHistory.getPartnerResetReason([players[1]], court, "A", players);

  assert.equal(result, "match-history-exhausted");
});

test("keeps match history when an eligible opposite-gender partner exists", () => {
  const players = [
    { id: "m1", name: "A", gender: "M" as const, gamesPlayed: 0 },
    { id: "f1", name: "B", gender: "F" as const, gamesPlayed: 0 },
  ];
  const court = { id: "c1", name: "Court 1", teamA: ["m1"], teamB: [] };

  const result = matchHistory.getPartnerResetReason([players[1]], court, "A", players);

  assert.equal(result, null);
});

test("does not reset match history before a team has its first player", () => {
  const court = { id: "c1", name: "Court 1", teamA: [], teamB: [] };

  const result = matchHistory.getPartnerResetReason([], court, "A", []);

  assert.equal(result, null);
});

test("requests a reset when history blocks every player from an empty team", () => {
  const players = [
    { id: "m1", name: "A", gender: "M" as const, gamesPlayed: 0, opponentIds: ["m2"] },
    { id: "f1", name: "B", gender: "F" as const, gamesPlayed: 0, opponentIds: ["f2"] },
    { id: "m2", name: "C", gender: "M" as const, gamesPlayed: 0 },
    { id: "f2", name: "D", gender: "F" as const, gamesPlayed: 0 },
  ];
  const court = { id: "c1", name: "Court 1", teamA: [], teamB: ["m2", "f2"] };

  const result = matchHistory.getPartnerResetReason(players.slice(0, 2), court, "A", players);

  assert.equal(result, "match-history-exhausted");
});

test("auto-fill requests a reset rather than using a same-gender partner", () => {
  const players = [
    { id: "m1", name: "A", gender: "M" as const, gamesPlayed: 0 },
    { id: "m2", name: "B", gender: "M" as const, gamesPlayed: 0 },
    { id: "m3", name: "C", gender: "M" as const, gamesPlayed: 0 },
    { id: "f2", name: "D", gender: "F" as const, gamesPlayed: 0 },
  ];
  const courts = [{ id: "c1", name: "Court 1", teamA: ["m1"], teamB: ["m3", "f2"] }];
  const queue = { M: [{ id: "q1", playerId: "m2" }], F: [] };

  const result = matchHistory.planAutoFill(courts, queue, players);

  assert.deepEqual(result, {
    assignments: [],
    totalSlots: 1,
    needsHistoryReset: true,
  });
});

test("auto-fill keeps match history when a later required-gender partner can join", () => {
  const players = [
    { id: "m1", name: "A", gender: "M" as const, gamesPlayed: 0 },
    { id: "f1", name: "B", gender: "F" as const, gamesPlayed: 0, partnerIds: ["m1"] },
    { id: "f2", name: "C", gender: "F" as const, gamesPlayed: 0 },
    { id: "m2", name: "D", gender: "M" as const, gamesPlayed: 0 },
    { id: "f3", name: "E", gender: "F" as const, gamesPlayed: 0 },
  ];
  const courts = [{ id: "c1", name: "Court 1", teamA: ["m1"], teamB: ["m2", "f3"] }];
  const queue = {
    M: [],
    F: [
      { id: "q1", playerId: "f1" },
      { id: "q2", playerId: "f2" },
    ],
  };

  const result = matchHistory.planAutoFill(courts, queue, players);

  assert.deepEqual(result, {
    assignments: [{ courtId: "c1", team: "A", playerId: "f2", entryId: "q2" }],
    totalSlots: 1,
    needsHistoryReset: false,
  });
});

test("auto-fill tries a later first player before resetting an available mixed pair", () => {
  const players = [
    { id: "m1", name: "A", gender: "M" as const, gamesPlayed: 0 },
    { id: "m2", name: "B", gender: "M" as const, gamesPlayed: 0 },
    { id: "f1", name: "C", gender: "F" as const, gamesPlayed: 0, partnerIds: ["m1"] },
    { id: "m3", name: "D", gender: "M" as const, gamesPlayed: 0 },
    { id: "f2", name: "E", gender: "F" as const, gamesPlayed: 0 },
  ];
  const courts = [{ id: "c1", name: "Court 1", teamA: [], teamB: ["m3", "f2"] }];
  const queue = {
    M: [
      { id: "q1", playerId: "m1" },
      { id: "q2", playerId: "m2" },
    ],
    F: [{ id: "q3", playerId: "f1" }],
  };

  const result = matchHistory.planAutoFill(courts, queue, players);

  assert.deepEqual(result, {
    assignments: [
      { courtId: "c1", team: "A", playerId: "m2", entryId: "q2" },
      { courtId: "c1", team: "A", playerId: "f1", entryId: "q3" },
    ],
    totalSlots: 2,
    needsHistoryReset: false,
  });
});

test("auto-fill can assign an opposite-gender partner after match history is cleared", () => {
  const players = [
    { id: "m1", name: "A", gender: "M" as const, gamesPlayed: 0 },
    { id: "f1", name: "B", gender: "F" as const, gamesPlayed: 0, partnerIds: ["m1"] },
    { id: "m2", name: "C", gender: "M" as const, gamesPlayed: 0 },
    { id: "f2", name: "D", gender: "F" as const, gamesPlayed: 0 },
  ];
  const courts = [{ id: "c1", name: "Court 1", teamA: ["m1"], teamB: ["m2", "f2"] }];
  const queue = { M: [], F: [{ id: "q1", playerId: "f1" }] };

  const blocked = matchHistory.planAutoFill(courts, queue, players);
  const cleared = matchHistory.planAutoFill(
    courts,
    queue,
    players.map((player) => ({
      ...player,
      lastPartnerIds: [],
      partnerIds: [],
      opponentIds: [],
    }))
  );

  assert.deepEqual(blocked, {
    assignments: [],
    totalSlots: 1,
    needsHistoryReset: true,
  });
  assert.deepEqual(cleared, {
    assignments: [{ courtId: "c1", team: "A", playerId: "f1", entryId: "q1" }],
    totalSlots: 1,
    needsHistoryReset: false,
  });
});

test("shares one in-flight match history reset across manual and auto-fill requests", async () => {
  let resetCalls = 0;
  let finishReset: (() => void) | undefined;
  const reset = () => {
    resetCalls += 1;
    return new Promise<void>((resolve) => {
      finishReset = resolve;
    });
  };
  const state = { current: null as Promise<void> | null };

  const manualReset = matchHistory.runMatchHistoryResetSingleFlight(state, reset);
  const autoFillReset = matchHistory.runMatchHistoryResetSingleFlight(state, reset);

  assert.equal(resetCalls, 1);
  assert.equal(manualReset, autoFillReset);

  finishReset?.();
  await manualReset;
});

test("allows a new match history reset after an in-flight reset fails", async () => {
  let resetCalls = 0;
  const state = { current: null as Promise<void> | null };

  await assert.rejects(
    matchHistory.runMatchHistoryResetSingleFlight(state, async () => {
      resetCalls += 1;
      throw new Error("temporary failure");
    }),
    /temporary failure/
  );
  await matchHistory.runMatchHistoryResetSingleFlight(state, async () => {
    resetCalls += 1;
  });

  assert.equal(resetCalls, 2);
});

test("blocks a game result while a match history reset is active", () => {
  const gate = { resetRequests: 0, activeGameResults: 0 };

  assert.equal(matchHistory.tryBeginMatchHistoryReset(gate), true);
  assert.equal(matchHistory.tryBeginGameResult(gate), false);

  matchHistory.finishMatchHistoryReset(gate);
  assert.equal(matchHistory.tryBeginGameResult(gate), true);
});

test("blocks a match history reset while a game result is active", () => {
  const gate = { resetRequests: 0, activeGameResults: 0 };

  assert.equal(matchHistory.tryBeginGameResult(gate), true);
  assert.equal(matchHistory.tryBeginMatchHistoryReset(gate), false);

  matchHistory.finishGameResult(gate);
  assert.equal(matchHistory.tryBeginMatchHistoryReset(gate), true);
});

test("captures player match history for undo without sharing mutable arrays", () => {
  const players = [{
    id: "p1",
    name: "A",
    gender: "M" as const,
    gamesPlayed: 2,
    lastPartnerIds: ["p2"],
    partnerIds: ["p2", "p3"],
    opponentIds: ["p4"],
  }];
  const result = matchHistory.capturePlayerMatchHistories(players);
  players[0].partnerIds.push("p5");

  assert.deepEqual(result, [{
    id: "p1",
    lastPartnerIds: ["p2"],
    partnerIds: ["p2", "p3"],
    opponentIds: ["p4"],
  }]);
});
