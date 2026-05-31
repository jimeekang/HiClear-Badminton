# PWA Installable App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HiClear Badminton Court를 태블릿/PC 브라우저에서 설치 가능한 PWA 앱처럼 실행할 수 있게 만든다.

**Architecture:** 외부 PWA 패키지 없이 Next.js App Router의 metadata/viewport, 정적 manifest, public service worker, 클라이언트 등록 컴포넌트로 구성한다. Firestore 실시간 요청은 서비스 워커 캐시 대상에서 제외하고, 앱 shell과 정적 자산만 캐시해서 설치성과 기본 로딩 안정성을 확보한다.

**Tech Stack:** Next.js App Router, TypeScript, React, Firebase Firestore, Web App Manifest, Service Worker.

---

## 제안

- `public/manifest.webmanifest`를 추가해 앱 이름, 시작 URL, 표시 모드, 색상, 아이콘을 정의한다.
- 현재 로고에서 PWA용 192x192, 512x512 PNG 아이콘을 생성해서 설치 조건을 안정적으로 맞춘다.
- `app/layout.tsx` metadata와 viewport에 manifest, theme color, apple web app 옵션을 연결한다.
- `public/sw.js`를 직접 작성하고, 앱 shell/static asset만 캐시한다.
- Firestore, Firebase Auth, Google API 요청은 서비스 워커에서 캐시하지 않고 네트워크로 통과시킨다.
- `components/PwaRegistrar.tsx`에서 서비스 워커를 등록한다.
- `components/InstallAppButton.tsx`에서 Android/Chrome/Edge의 `beforeinstallprompt`를 받아 `앱 설치` 버튼을 표시한다.
- iPad/iPhone처럼 `beforeinstallprompt`가 없는 브라우저는 설치 가능 여부를 자동 표시하지 않고, 필요하면 별도 안내 UI는 후속 작업으로 둔다.
- 이미 standalone 앱으로 실행 중이면 설치 버튼을 숨긴다.

## 변경 파일 구조

- Create: `public/manifest.webmanifest`
  - PWA 앱 이름, 시작 경로, 표시 모드, 색상, 아이콘 정의.
- Create: `scripts/generate-pwa-icons.mjs`
  - `public/logo.png.jpg`에서 PWA PNG 아이콘 생성.
- Create: `public/icons/icon-192.png`
  - 일반 런처 아이콘.
- Create: `public/icons/icon-512.png`
  - 고해상도 일반 런처 아이콘.
- Create: `public/icons/maskable-192.png`
  - Android maskable 아이콘.
- Create: `public/icons/maskable-512.png`
  - 고해상도 Android maskable 아이콘.
- Create: `public/sw.js`
  - 서비스 워커 install/activate/fetch 처리.
  - 앱 shell과 정적 자산만 캐시.
  - Firestore/Firebase 요청 캐시 제외.
- Create: `components/PwaRegistrar.tsx`
  - 클라이언트에서 서비스 워커 등록.
- Create: `components/InstallAppButton.tsx`
  - 설치 프롬프트 버튼.
  - standalone 모드에서 자동 숨김.
- Modify: `app/layout.tsx`
  - PWA metadata 추가.
  - `PwaRegistrar`를 body에 추가.
- Modify: `components/NavBar.tsx`
  - 우측에 설치 버튼 추가.
- Create: `tests/pwaConfig.test.mts`
  - manifest, service worker, layout 연결 검증.
- Modify: `package.json`
  - `npm test`에 PWA 테스트 파일 추가.

---

### Task 1: Generate PWA Icons

**Files:**
- Create: `scripts/generate-pwa-icons.mjs`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/maskable-192.png`
- Create: `public/icons/maskable-512.png`
- Modify: `package.json`
- Create: `tests/pwaConfig.test.mts`

- [ ] **Step 1: Install icon generator dependency**

Run:

```bash
npm install -D sharp
```

Expected: `sharp` is added to `devDependencies`.

- [ ] **Step 2: Write failing icon config test**

Create `tests/pwaConfig.test.mts`.

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/pwaConfig.test.mts
```

Expected: FAIL because the generator script, package script, and generated icons do not exist.

- [ ] **Step 4: Create icon generator script**

Create `scripts/generate-pwa-icons.mjs`.

```js
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const source = "public/logo.png.jpg";
const outputDir = "public/icons";

async function makeIcon(size, filename, paddingRatio) {
  const logoSize = Math.round(size * paddingRatio);
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: "inside" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`${outputDir}/${filename}`);
}

await mkdir(outputDir, { recursive: true });
await makeIcon(192, "icon-192.png", 0.82);
await makeIcon(512, "icon-512.png", 0.82);
await makeIcon(192, "maskable-192.png", 0.64);
await makeIcon(512, "maskable-512.png", 0.64);
```

- [ ] **Step 5: Add icon script to package.json**

Modify `package.json`.

```json
{
  "scripts": {
    "pwa:icons": "node scripts/generate-pwa-icons.mjs"
  }
}
```

- [ ] **Step 6: Generate icons**

Run:

```bash
npm run pwa:icons
```

Expected: four PNG files are created under `public/icons`.

- [ ] **Step 7: Run icon test**

Run:

```bash
node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/pwaConfig.test.mts
```

Expected: PASS for icon generator test.

---

### Task 2: Add Web App Manifest

**Files:**
- Create: `public/manifest.webmanifest`
- Modify: `tests/pwaConfig.test.mts`

- [ ] **Step 1: Write failing manifest test**

Append to `tests/pwaConfig.test.mts`.

```ts
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
  assert.ok(manifest.icons.some((icon: { src?: string; sizes?: string }) => icon.src === "/icons/icon-192.png" && icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon: { src?: string; sizes?: string }) => icon.src === "/icons/icon-512.png" && icon.sizes === "512x512"));
  assert.ok(manifest.icons.some((icon: { src?: string; purpose?: string }) => icon.src === "/icons/maskable-512.png" && icon.purpose === "maskable"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: FAIL because `public/manifest.webmanifest` does not exist.

- [ ] **Step 3: Create manifest**

Create `public/manifest.webmanifest`.

```json
{
  "name": "HiClear Badminton Court",
  "short_name": "HiClear",
  "description": "Badminton club court rotation app",
  "start_url": "/courts",
  "scope": "/",
  "display": "standalone",
  "orientation": "landscape-primary",
  "background_color": "#f6f7fb",
  "theme_color": "#000000",
  "categories": ["sports", "productivity"],
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/maskable-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 4: Run test**

Run:

```bash
npm test
```

Expected: PASS for manifest test.

---

### Task 3: Add Service Worker

**Files:**
- Create: `public/sw.js`
- Modify: `tests/pwaConfig.test.mts`

- [ ] **Step 1: Add failing service worker test**

Append to `tests/pwaConfig.test.mts`.

```ts
test("service worker caches app shell but bypasses Firebase traffic", () => {
  assert.equal(existsSync("public/sw.js"), true);

  const source = readFileSync("public/sw.js", "utf8");

  assert.match(source, /const CACHE_NAME = "hiclear-pwa-v1"/);
  assert.match(source, /\/courts/);
  assert.match(source, /firestore\.googleapis\.com/);
  assert.match(source, /identitytoolkit\.googleapis\.com/);
  assert.match(source, /return fetch\(request\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: FAIL because `public/sw.js` does not exist.

- [ ] **Step 3: Create service worker**

Create `public/sw.js`.

```js
const CACHE_NAME = "hiclear-pwa-v1";
const APP_SHELL = [
  "/",
  "/courts",
  "/queue",
  "/players",
  "/logo.png.jpg",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
];
const NETWORK_ONLY_HOSTS = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "firebaseinstallations.googleapis.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (NETWORK_ONLY_HOSTS.includes(url.hostname)) return;
  if (url.pathname.startsWith("/__nextjs")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/courts")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === "opaque") return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
```

- [ ] **Step 4: Run test**

Run:

```bash
npm test
```

Expected: PASS for service worker test.

---

### Task 4: Register PWA In Next App

**Files:**
- Create: `components/PwaRegistrar.tsx`
- Modify: `app/layout.tsx`
- Modify: `tests/pwaConfig.test.mts`

- [ ] **Step 1: Add failing registration test**

Append to `tests/pwaConfig.test.mts`.

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: FAIL because `components/PwaRegistrar.tsx` and metadata changes do not exist.

- [ ] **Step 3: Create service worker registrar**

Create `components/PwaRegistrar.tsx`.

```tsx
"use client";

import { useEffect } from "react";

export default function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  }, []);

  return null;
}
```

- [ ] **Step 4: Update layout metadata**

Modify `app/layout.tsx`.

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";
import PwaRegistrar from "@/components/PwaRegistrar";

export const metadata: Metadata = {
  title: "HiClear Badminton Court",
  description: "배드민턴 클럽 코트 로테이션 앱",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "HiClear",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-white text-gray-900 min-h-screen">
        <PwaRegistrar />
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Run test and build**

Run:

```bash
npm test
npm run build
```

Expected: tests pass and Next build passes.

---

### Task 5: Add Install Button

**Files:**
- Create: `components/InstallAppButton.tsx`
- Modify: `components/NavBar.tsx`
- Modify: `tests/pwaConfig.test.mts`

- [ ] **Step 1: Add failing install button test**

Append to `tests/pwaConfig.test.mts`.

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: FAIL because install button is not implemented.

- [ ] **Step 3: Create install button component**

Create `components/InstallAppButton.tsx`.

```tsx
"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed || !promptEvent) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
        setPromptEvent(null);
      }}
      className="ml-auto h-12 rounded-lg border border-white/30 px-4 text-xl font-semibold text-white hover:bg-white/15"
    >
      앱 설치
    </button>
  );
}
```

- [ ] **Step 4: Add install button to navigation**

Modify `components/NavBar.tsx`.

```tsx
"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import InstallAppButton from "@/components/InstallAppButton";
```

Place the button after the navigation links.

```tsx
      {links.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`text-2xl font-semibold px-5 py-2 rounded-xl transition-colors ${
              active
                ? "bg-white text-black"
                : "text-gray-400 hover:bg-white/20 hover:text-white"
            }`}
          >
            {label}
          </Link>
        );
      })}
      <InstallAppButton />
```

- [ ] **Step 5: Run test and build**

Run:

```bash
npm test
npm run build
```

Expected: tests pass and Next build passes.

---

### Task 6: Add PWA Test Script Coverage

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add failing package test assertion**

Append to `tests/pwaConfig.test.mts`.

```ts
test("npm test includes PWA config tests", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(pkg.scripts.test, /tests\/pwaConfig\.test\.mts/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: FAIL because `tests/pwaConfig.test.mts` is not listed in `package.json`.

- [ ] **Step 3: Update test script**

Modify `package.json` and add this script beside the existing scripts.

```json
{
  "scripts": {
    "test": "node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/matchHistory.test.mts tests/metadata.test.mts tests/courtAnnouncement.test.mts tests/courtVoice.test.mts tests/courtVoiceSettings.test.mts tests/firebaseConfig.test.mts tests/pwaConfig.test.mts"
  }
}
```

- [ ] **Step 4: Run test**

Run:

```bash
npm test
```

Expected: PASS and PWA tests are included in the normal test suite.

---

### Task 7: Browser Verification

**Files:**
- No code files.

- [ ] **Step 1: Start local app on port 3002**

Run:

```bash
npx next dev -p 3002
```

Expected: app starts at `http://localhost:3002`.

- [ ] **Step 2: Open app**

Open:

```text
http://localhost:3002/courts
```

Expected:

- Page loads without console errors.
- Existing courts page still renders.
- Firestore connection still works.
- Service worker is registered.

- [ ] **Step 3: Verify manifest**

In the browser console:

```js
fetch("/manifest.webmanifest").then((r) => r.json()).then(console.log);
```

Expected:

- `name` is `HiClear Badminton Court`.
- `start_url` is `/courts`.
- `display` is `standalone`.

- [ ] **Step 4: Verify service worker**

In the browser console:

```js
navigator.serviceWorker.getRegistration().then((registration) => ({
  registered: Boolean(registration),
  scriptURL: registration?.active?.scriptURL || registration?.installing?.scriptURL || registration?.waiting?.scriptURL,
}));
```

Expected:

- `registered` is `true`.
- `scriptURL` ends with `/sw.js`.

- [ ] **Step 5: Verify install prompt behavior**

Use Chrome or Edge against `http://localhost:3002/courts`.

Expected:

- Browser install icon or `앱 설치` button appears when the browser considers the app installable.
- Clicking `앱 설치` opens the native install prompt.
- After install or when opened standalone, the button is hidden.

- [ ] **Step 6: Verify realtime data is not cached incorrectly**

Actions:

1. Open installed app or browser tab on `/courts`.
2. Add or move a player.
3. Refresh the page.

Expected:

- Latest Firestore data appears.
- No stale cached court state is shown as the source of truth.

---

## Risks

- `beforeinstallprompt` is not supported on every browser. Chrome/Edge Android and desktop can show it; iOS Safari usually requires manual "Add to Home Screen".
- The generated icons use the current logo centered on a white square. A later visual polish pass can refine the launcher icon artwork if the OS crop looks weak.
- Service worker cache can accidentally stale realtime app pages if too aggressive. This plan uses network-first navigation and bypasses Firebase hosts to keep Firestore behavior current.
- PWA installation can behave differently on localhost and production. Final acceptance should be checked on the deployment URL as well.

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-05-31-pwa-installable-app.md`.

Two execution options:

1. Subagent-Driven (recommended) - task별 fresh subagent 실행 후 검토
2. Inline Execution - 현재 세션에서 순서대로 구현
