import assert from "node:assert/strict";
import test from "node:test";
import { checkAssignmentConflict } from "../lib/matchHistory.ts";

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
