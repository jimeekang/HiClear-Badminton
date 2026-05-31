import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Firestore uses forced long polling for webview compatibility", () => {
  const source = readFileSync("lib/firebase.ts", "utf8");

  assert.match(source, /initializeFirestore/);
  assert.match(source, /experimentalForceLongPolling:\s*true/);
  assert.match(source, /experimentalLongPollingOptions:\s*{\s*timeoutSeconds:\s*10\s*}/);
  assert.doesNotMatch(source, /export const db = getFirestore/);
});
