import assert from "node:assert/strict";
import test from "node:test";
import React, { createElement } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { closestCenter, MouseSensor, TouchSensor } from "@dnd-kit/core";
import { useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";

const sessionReset = await import("../lib/sessionReset.ts");
const sessionSortableDndModule = await import("../components/SessionSortableDnd.ts")
  .catch(() => ({}));
const SessionSortableDnd = (sessionSortableDndModule as {
  default?: React.ComponentType<any>;
}).default;

// Regression: ISSUE-004 — full reset changed DndContext sensor dependency length
// Found by /qa on 2026-09-02
// Report: .gstack/qa-reports/qa-report-localhost-3000-2026-09-02.md
test("keeps DnD sensors stable while disabling sorting during a session reset", () => {
  const getSessionDragState = sessionReset.getSessionDragState as
    | undefined
    | (<T>(sensors: T, resetting: boolean) => { sensors: T; disabled: boolean });

  assert.equal(typeof getSessionDragState, "function");
  if (!getSessionDragState) return;

  const sensors = [{ sensor: "mouse" }, { sensor: "touch" }];
  const ready = getSessionDragState(sensors, false);
  const resetting = getSessionDragState(sensors, true);

  assert.equal(ready.sensors, sensors);
  assert.equal(resetting.sensors, sensors);
  assert.equal(ready.disabled, false);
  assert.equal(resetting.disabled, true);
});

test("updates a mounted DnD tree without changing hook dependencies and disables drag listeners", async () => {
  assert.equal(typeof SessionSortableDnd, "function");
  if (!SessionSortableDnd) return;

  const renders: Array<{ disabled: boolean; hasListeners: boolean }> = [];
  const consoleErrors: string[] = [];
  const originalConsoleError = console.error;
  const actEnvironment = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(" ");
    if (!message.includes("react-test-renderer is deprecated")) {
      consoleErrors.push(message);
    }
  };

  const sensors = [
    { sensor: MouseSensor, options: {} },
    { sensor: TouchSensor, options: {} },
  ];
  const Probe = () => {
    const { attributes, listeners } = useSortable({ id: "player-1" });
    renders.push({
      disabled: attributes["aria-disabled"] === true,
      hasListeners: Boolean(listeners),
    });
    return createElement("div", { ...attributes, ...listeners });
  };
  const tree = (disabled: boolean) => createElement(
    SessionSortableDnd,
    {
      sensors,
      disabled,
      items: ["player-1"],
      strategy: verticalListSortingStrategy,
      collisionDetection: closestCenter,
    },
    createElement(Probe)
  );

  let renderer: TestRenderer.ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = TestRenderer.create(tree(false));
    });
    assert.deepEqual(renders.at(-1), { disabled: false, hasListeners: true });

    await act(async () => {
      renderer?.update(tree(true));
    });
    assert.deepEqual(renders.at(-1), { disabled: true, hasListeners: false });
    assert.equal(
      consoleErrors.some((message) =>
        message.includes("final argument passed to useEffect changed size")
      ),
      false
    );
  } finally {
    if (renderer) {
      await act(async () => {
        renderer?.unmount();
      });
    }
    console.error = originalConsoleError;
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
