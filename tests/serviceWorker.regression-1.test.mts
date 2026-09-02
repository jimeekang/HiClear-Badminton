import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Regression: ISSUE-001 — cached Next.js chunks hid freshly compiled UI changes
// Found by /qa on 2026-09-02
// Report: .gstack/qa-reports/qa-report-localhost-3000-2026-09-02.md
async function runFetchRequest(url: string) {
  const source = readFileSync("public/sw.js", "utf8");
  let fetchHandler: ((event: unknown) => void) | undefined;
  let respondWithCalls = 0;
  let cacheMatchCalls = 0;
  let responsePromise: Promise<unknown> | undefined;

  runInNewContext(source, {
    URL,
    fetch: () => Promise.resolve(new Response()),
    caches: {
      match: () => {
        cacheMatchCalls += 1;
        return Promise.resolve(new Response("cached"));
      },
    },
    self: {
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        if (type === "fetch") fetchHandler = handler;
      },
    },
  });

  assert.ok(fetchHandler);
  fetchHandler({
    request: {
      method: "GET",
      mode: "cors",
      url,
    },
    respondWith: (response: Promise<unknown>) => {
      respondWithCalls += 1;
      responsePromise = response;
    },
  });
  await responsePromise;

  return { respondWithCalls, cacheMatchCalls };
}

test("service worker bypasses Next.js runtime assets on development origins", async () => {
  for (const url of [
    "http://localhost:3000/_next/static/chunks/app_courts_page.js",
    "http://127.0.0.1:3000/_next/static/css/app.css",
    "http://192.168.1.167:3000/_next/image?url=%2Flogo.png.jpg&w=128&q=75",
  ]) {
    assert.deepEqual(await runFetchRequest(url), {
      respondWithCalls: 0,
      cacheMatchCalls: 0,
    });
  }
});

test("service worker keeps production Next.js and ordinary assets cacheable", async () => {
  for (const url of [
    "https://hiclear.example/_next/static/chunks/app.js",
    "http://localhost:3000/logo.png.jpg",
  ]) {
    assert.deepEqual(await runFetchRequest(url), {
      respondWithCalls: 1,
      cacheMatchCalls: 1,
    });
  }
});
