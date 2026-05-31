import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("browser title is HiClear Badminton Court", () => {
  const source = readFileSync("app/layout.tsx", "utf8");

  assert.match(source, /title:\s*"HiClear Badminton Court"/);
});
