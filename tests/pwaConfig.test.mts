import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("PWA icon generator and generated icons exist", () => {
  assert.equal(existsSync("scripts/generate-pwa-icons.mjs"), true);

  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(pkg.scripts["pwa:icons"], "node scripts/generate-pwa-icons.mjs");

  [
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "public/icons/maskable-192.png",
    "public/icons/maskable-512.png",
  ].forEach((file) => assert.equal(existsSync(file), true, `${file} should exist`));
});

test("PWA manifest exists with installable app settings", () => {
  assert.equal(existsSync("public/manifest.webmanifest"), true);

  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));

  assert.equal(manifest.name, "HiClear Badminton Court");
  assert.equal(manifest.short_name, "HiClear");
  assert.equal(manifest.start_url, "/courts");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#f6f7fb");
  assert.equal(manifest.theme_color, "#000000");
  assert.ok(Array.isArray(manifest.icons));
  assert.ok(
    manifest.icons.some(
      (icon: { src?: string; sizes?: string }) =>
        icon.src === "/icons/icon-192.png" && icon.sizes === "192x192"
    )
  );
  assert.ok(
    manifest.icons.some(
      (icon: { src?: string; sizes?: string }) =>
        icon.src === "/icons/icon-512.png" && icon.sizes === "512x512"
    )
  );
  assert.ok(
    manifest.icons.some(
      (icon: { src?: string; purpose?: string }) =>
        icon.src === "/icons/maskable-512.png" && icon.purpose === "maskable"
    )
  );
});

test("service worker caches app shell but bypasses Firebase traffic", () => {
  assert.equal(existsSync("public/sw.js"), true);

  const source = readFileSync("public/sw.js", "utf8");

  assert.match(source, /const CACHE_NAME = "hiclear-pwa-v1"/);
  assert.match(source, /\/courts/);
  assert.match(source, /firestore\.googleapis\.com/);
  assert.match(source, /identitytoolkit\.googleapis\.com/);
  assert.match(source, /return fetch\(request\)/);
});

test("Next layout exposes PWA metadata and registers the service worker", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");

  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /export const viewport/);
  assert.match(layout, /themeColor:\s*"#000000"/);
  assert.match(layout, /appleWebApp:/);
  assert.match(layout, /<PwaRegistrar \/>/);
});

test("PwaRegistrar registers public service worker only in supported browsers", () => {
  const source = readFileSync("components/PwaRegistrar.tsx", "utf8");

  assert.match(source, /"use client"/);
  assert.match(source, /"serviceWorker" in navigator/);
  assert.match(source, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
});

test("install button listens for browser PWA install prompt", () => {
  const source = readFileSync("components/InstallAppButton.tsx", "utf8");

  assert.match(source, /beforeinstallprompt/);
  assert.match(source, /prompt\(\)/);
  assert.match(source, /display-mode:\s*standalone/);
  assert.match(source, /앱 설치/);
});

test("NavBar renders install app button", () => {
  const source = readFileSync("components/NavBar.tsx", "utf8");

  assert.match(source, /InstallAppButton/);
  assert.match(source, /<InstallAppButton \/>/);
});

test("npm test includes PWA config tests", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(pkg.scripts.test, /tests\/pwaConfig\.test\.mts/);
});
