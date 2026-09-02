import type { Court, Player, QueueEntry } from "@/types";

export interface SessionResetTargets {
  queueEntryIds: string[];
  courtIds: string[];
  playerIds: string[];
}

export interface SessionResetPlan {
  queueEntryIds: string[];
  courts: Array<{
    id: string;
    data: { teamA: []; teamB: []; gamesA: 0; gamesB: 0 };
  }>;
  players: Array<{
    id: string;
    data: { lastPartnerIds: []; partnerIds: []; opponentIds: [] };
  }>;
}

export interface SessionResetStore {
  loadTargets: () => Promise<SessionResetTargets>;
  commit: (plan: SessionResetPlan) => Promise<void>;
}

export interface SessionResetSingleFlightState {
  current: Promise<void> | null;
}

export interface SessionOperationState extends SessionResetSingleFlightState {
  resetPending: boolean;
  resetting: boolean;
  activeMutations: Set<Promise<unknown>>;
}

export function getSessionDragState<T>(
  sensors: T,
  resetting: boolean
): { sensors: T; disabled: boolean } {
  return { sensors, disabled: resetting };
}

const sessionMutationScopeBrand: unique symbol = Symbol("sessionMutationScope");

export interface SessionMutationScope {
  readonly [sessionMutationScopeBrand]: true;
  follow<T>(mutation: () => Promise<T>): Promise<T>;
}

interface SessionMutationScopeState {
  active: boolean;
  requests: Set<Promise<unknown>>;
}

export function runSessionResetSingleFlight(
  state: SessionResetSingleFlightState,
  reset: () => Promise<void>
): Promise<void> {
  if (state.current) return state.current;

  const request = reset();
  state.current = request;
  void request.then(
    () => { if (state.current === request) state.current = null; },
    () => { if (state.current === request) state.current = null; }
  );
  return request;
}

export function runConfirmedSessionReset(
  state: SessionResetSingleFlightState,
  canReset: boolean,
  confirmReset: () => boolean,
  reset: () => Promise<void>,
  onSuccess: () => void
): Promise<void> | null {
  if (!canReset || state.current || !confirmReset()) return null;

  const request = (async () => {
    await reset();
    onSuccess();
  })();
  state.current = request;
  void request.then(
    () => { if (state.current === request) state.current = null; },
    () => { if (state.current === request) state.current = null; }
  );
  return request;
}

export function runSessionMutation<T>(
  state: SessionOperationState,
  mutation: (scope: SessionMutationScope) => Promise<T>
): Promise<T> | null {
  if (state.resetPending) return null;

  const scopeState: SessionMutationScopeState = {
    active: true,
    requests: new Set<Promise<unknown>>(),
  };
  const scope: SessionMutationScope = {
    [sessionMutationScopeBrand]: true,
    follow<R>(followUp: () => Promise<R>): Promise<R> {
      if (!scopeState.active || state.resetting) {
        return Promise.reject(new Error("Session mutation scope expired"));
      }
      return trackSessionMutation(state, scopeState, followUp);
    },
  };

  return trackSessionMutation(state, scopeState, () => mutation(scope));
}

function trackSessionMutation<T>(
  state: SessionOperationState,
  scope: SessionMutationScopeState,
  mutation: () => Promise<T>
): Promise<T> {
  let resolveRequest!: (value: T | PromiseLike<T>) => void;
  let rejectRequest!: (reason?: unknown) => void;
  const request = new Promise<T>((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  state.activeMutations.add(request);
  scope.requests.add(request);

  void Promise.resolve()
    .then(mutation)
    .then(resolveRequest, rejectRequest);

  const finish = () => {
    state.activeMutations.delete(request);
    scope.requests.delete(request);
    if (scope.requests.size === 0) scope.active = false;
  };
  void request.then(
    finish,
    finish
  );
  return request;
}

async function waitForTrackedMutations(state: SessionOperationState): Promise<void> {
  while (true) {
    const activeMutations = [...state.activeMutations];
    if (activeMutations.length > 0) {
      await Promise.allSettled(activeMutations);
      continue;
    }

    await Promise.resolve();
    if (state.activeMutations.size === 0) return;
  }
}

export function runCoordinatedSessionReset(
  state: SessionOperationState,
  reset: () => Promise<void>
): Promise<void> {
  if (state.current) return state.current;

  state.resetPending = true;
  state.resetting = false;
  const request = runSessionResetSingleFlight(state, async () => {
    await waitForTrackedMutations(state);
    state.resetting = true;
    await reset();
  });
  void request.then(
    () => {
      state.resetPending = false;
      state.resetting = false;
    },
    () => {
      state.resetPending = false;
      state.resetting = false;
    }
  );
  return request;
}

export function buildSessionResetPlan(targets: SessionResetTargets): SessionResetPlan {
  return {
    queueEntryIds: targets.queueEntryIds,
    courts: targets.courtIds.map((id) => ({
      id,
      data: { teamA: [], teamB: [], gamesA: 0, gamesB: 0 },
    })),
    players: targets.playerIds.map((id) => ({
      id,
      data: { lastPartnerIds: [], partnerIds: [], opponentIds: [] },
    })),
  };
}

export async function resetSession(store: SessionResetStore): Promise<void> {
  const targets = await store.loadTargets();
  await store.commit(buildSessionResetPlan(targets));
}

export function hasSessionStateToReset(
  queue: readonly Pick<QueueEntry, "id">[],
  courts: readonly Pick<Court, "teamA" | "teamB" | "gamesA" | "gamesB">[],
  players: readonly Pick<Player, "lastPartnerIds" | "partnerIds" | "opponentIds">[]
): boolean {
  if (queue.length > 0) return true;
  if (courts.some((court) =>
    court.teamA.length > 0 ||
    court.teamB.length > 0 ||
    (court.gamesA ?? 0) > 0 ||
    (court.gamesB ?? 0) > 0
  )) return true;

  return players.some((player) =>
    (player.lastPartnerIds?.length ?? 0) > 0 ||
    (player.partnerIds?.length ?? 0) > 0 ||
    (player.opponentIds?.length ?? 0) > 0
  );
}
