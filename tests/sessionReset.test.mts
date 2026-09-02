import assert from "node:assert/strict";
import test from "node:test";

const sessionReset = await import("../lib/sessionReset.ts");

test("resets queue, courts, and player match history in one commit", async () => {
  assert.equal(typeof sessionReset.resetSession, "function");

  const commits: unknown[] = [];
  await sessionReset.resetSession({
    loadTargets: async () => ({
      queueEntryIds: ["q1", "q2"],
      courtIds: ["c1"],
      playerIds: ["p1", "p2"],
    }),
    commit: async (plan: unknown) => { commits.push(plan); },
  });

  assert.deepEqual(commits, [{
    queueEntryIds: ["q1", "q2"],
    courts: [{
      id: "c1",
      data: { teamA: [], teamB: [], gamesA: 0, gamesB: 0 },
    }],
    players: [
      { id: "p1", data: { lastPartnerIds: [], partnerIds: [], opponentIds: [] } },
      { id: "p2", data: { lastPartnerIds: [], partnerIds: [], opponentIds: [] } },
    ],
  }]);
});

test("shares one in-flight full reset within the same app runtime", async () => {
  let resetCalls = 0;
  let finishReset: (() => void) | undefined;
  const state = { current: null as Promise<void> | null };
  const reset = () => {
    resetCalls += 1;
    return new Promise<void>((resolve) => { finishReset = resolve; });
  };

  const first = sessionReset.runSessionResetSingleFlight(state, reset);
  const second = sessionReset.runSessionResetSingleFlight(state, reset);

  assert.equal(first, second);
  assert.equal(resetCalls, 1);
  finishReset?.();
  await first;
});

test("allows a new full reset after an in-flight reset fails", async () => {
  const state = { current: null as Promise<void> | null };
  let resetCalls = 0;

  await assert.rejects(sessionReset.runSessionResetSingleFlight(state, async () => {
    resetCalls += 1;
    throw new Error("temporary failure");
  }));
  await sessionReset.runSessionResetSingleFlight(state, async () => {
    resetCalls += 1;
  });

  assert.equal(resetCalls, 2);
});

test("waits for an active session mutation before starting a full reset", async () => {
  const state = {
    current: null as Promise<void> | null,
    resetPending: false,
    resetting: false,
    activeMutations: new Set<Promise<unknown>>(),
  };
  const events: string[] = [];
  let finishMutation: (() => void) | undefined;

  const mutation = sessionReset.runSessionMutation(state, async () => {
    events.push("mutation-started");
    await new Promise<void>((resolve) => { finishMutation = resolve; });
    events.push("mutation-finished");
  });
  const reset = sessionReset.runCoordinatedSessionReset(state, async () => {
    events.push("reset-started");
  });

  await Promise.resolve();
  assert.deepEqual(events, ["mutation-started"]);

  finishMutation?.();
  await Promise.all([mutation, reset]);
  assert.deepEqual(events, ["mutation-started", "mutation-finished", "reset-started"]);
});

test("blocks a new session mutation after a full reset is requested", async () => {
  const state = {
    current: null as Promise<void> | null,
    resetPending: false,
    resetting: false,
    activeMutations: new Set<Promise<unknown>>(),
  };
  let finishReset: (() => void) | undefined;
  let mutationCalls = 0;

  const reset = sessionReset.runCoordinatedSessionReset(state, () =>
    new Promise<void>((resolve) => { finishReset = resolve; })
  );
  const blocked = sessionReset.runSessionMutation(state, async () => {
    mutationCalls += 1;
  });

  assert.equal(blocked, null);
  assert.equal(mutationCalls, 0);
  await new Promise((resolve) => setImmediate(resolve));
  finishReset?.();
  await reset;
});

test("returns admission before an accepted mutation starts", async () => {
  const state = {
    current: null as Promise<void> | null,
    resetPending: false,
    resetting: false,
    activeMutations: new Set<Promise<unknown>>(),
  };
  const events: string[] = [];

  const mutation = sessionReset.runSessionMutation(state, async () => {
    events.push("write-started");
  });
  assert.ok(mutation);
  events.push("snapshot-saved");
  await mutation;

  assert.deepEqual(events, ["snapshot-saved", "write-started"]);
});

test("does not expose an unguarded session mutation entry point", () => {
  assert.equal("trackSessionMutation" in sessionReset, false);
});

test("lets an admitted mutation scope finish follow-up work before reset", async () => {
  const state = {
    current: null as Promise<void> | null,
    resetPending: false,
    resetting: false,
    activeMutations: new Set<Promise<unknown>>(),
  };
  const events: string[] = [];
  let finishFirst: (() => void) | undefined;
  let finishFollowUp: (() => void) | undefined;

  const first = sessionReset.runSessionMutation(state, async (scope) => {
    await new Promise<void>((resolve) => { finishFirst = resolve; });
    await scope.follow(async () => {
      events.push("follow-up-started");
      await new Promise<void>((resolve) => { finishFollowUp = resolve; });
      events.push("follow-up-finished");
    });
  });
  await Promise.resolve();
  const reset = sessionReset.runCoordinatedSessionReset(state, async () => {
    events.push("reset-started");
  });

  finishFirst?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["follow-up-started"]);

  finishFollowUp?.();
  await Promise.all([first, reset]);
  assert.deepEqual(events, ["follow-up-started", "follow-up-finished", "reset-started"]);
});

test("rejects follow-up work from an expired mutation scope", async () => {
  const state = {
    current: null as Promise<void> | null,
    resetPending: false,
    resetting: false,
    activeMutations: new Set<Promise<unknown>>(),
  };
  let admittedScope: { follow: <T>(mutation: () => Promise<T>) => Promise<T> } | undefined;

  await sessionReset.runSessionMutation(state, async (scope) => {
    admittedScope = scope;
  });

  let mutationCalls = 0;
  const expiredScope = admittedScope;
  assert.ok(expiredScope);
  await assert.rejects(expiredScope.follow(async () => {
    mutationCalls += 1;
  }), /expired/i);
  assert.equal(mutationCalls, 0);
});

test("reopens session mutations after a coordinated reset fails", async () => {
  const state = {
    current: null as Promise<void> | null,
    resetPending: false,
    resetting: false,
    activeMutations: new Set<Promise<unknown>>(),
  };

  await assert.rejects(
    sessionReset.runCoordinatedSessionReset(state, async () => {
      throw new Error("reset failed");
    }),
    /reset failed/
  );

  let mutationCalls = 0;
  const mutation = sessionReset.runSessionMutation(state, async () => {
    mutationCalls += 1;
  });
  assert.ok(mutation);
  await mutation;
  assert.equal(mutationCalls, 1);
  assert.equal(state.resetPending, false);
  assert.equal(state.resetting, false);
});

test("offers a full reset when only a court still has players", () => {
  assert.equal(typeof sessionReset.hasSessionStateToReset, "function");

  const result = sessionReset.hasSessionStateToReset(
    [],
    [{ teamA: ["p1"], teamB: [], gamesA: 0, gamesB: 0 }],
    [{}]
  );

  assert.equal(result, true);
});

test("offers a full reset when only match history remains", () => {
  assert.equal(typeof sessionReset.hasSessionStateToReset, "function");

  const result = sessionReset.hasSessionStateToReset(
    [],
    [{ teamA: [], teamB: [], gamesA: 0, gamesB: 0 }],
    [{ partnerIds: ["p2"] }]
  );

  assert.equal(result, true);
});

test("does not offer a full reset for an empty session", () => {
  assert.equal(typeof sessionReset.hasSessionStateToReset, "function");

  const result = sessionReset.hasSessionStateToReset(
    [],
    [{ teamA: [], teamB: [], gamesA: 0, gamesB: 0 }],
    [{}]
  );

  assert.equal(result, false);
});

test("runs one confirmed reset and clears court-local history after success", async () => {
  assert.equal(typeof sessionReset.runConfirmedSessionReset, "function");

  const state = { current: null as Promise<void> | null };
  const events: string[] = [];
  let finishReset: (() => void) | undefined;
  const reset = () => {
    events.push("reset-started");
    return new Promise<void>((resolve) => { finishReset = resolve; });
  };

  const first = sessionReset.runConfirmedSessionReset(
    state,
    true,
    () => true,
    reset,
    () => { events.push("local-history-cleared"); }
  );
  const duplicate = sessionReset.runConfirmedSessionReset(
    state,
    true,
    () => true,
    reset,
    () => { events.push("duplicate-cleanup"); }
  );

  assert.ok(first);
  assert.equal(duplicate, null);
  assert.deepEqual(events, ["reset-started"]);

  finishReset?.();
  await first;
  assert.deepEqual(events, ["reset-started", "local-history-cleared"]);
  assert.equal(state.current, null);
});

test("keeps court-local history and allows retry when a confirmed reset fails", async () => {
  assert.equal(typeof sessionReset.runConfirmedSessionReset, "function");

  const state = { current: null as Promise<void> | null };
  let cleanupCalls = 0;
  const failedReset = sessionReset.runConfirmedSessionReset(
    state,
    true,
    () => true,
    async () => { throw new Error("reset failed"); },
    () => { cleanupCalls += 1; }
  );
  assert.ok(failedReset);
  await assert.rejects(failedReset, /reset failed/);

  assert.equal(cleanupCalls, 0);
  assert.equal(state.current, null);

  const retry = sessionReset.runConfirmedSessionReset(
    state,
    true,
    () => true,
    async () => {},
    () => { cleanupCalls += 1; }
  );
  assert.ok(retry);
  await retry;
  assert.equal(cleanupCalls, 1);
});
