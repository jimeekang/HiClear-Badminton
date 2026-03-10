# Firebase Backend Architect - Project Memory

## Project: HiClear-Badminton
- Firebase Project ID: `hiclear-badminton` (확인됨, `.firebaserc`)
- Stack: Next.js 16 App Router + TypeScript + Tailwind v4 + Firebase v12 + dnd-kit
- Firestore 전용 (Realtime Database 미사용)

## App Hosting 설정 결정사항
- `next.config.ts`: `output: "standalone"` 필수 (App Hosting 요구사항)
- `apphosting.yaml`: MEASUREMENT_ID 제외 (Analytics 미사용)
- `firebase.json`: `apphosting.source: "."` 추가, dataconnect 섹션 제거
- 환경변수: Secret Manager를 통해 BUILD + RUNTIME 양쪽 availability 설정
- `.env.local`은 `.gitignore`의 `.env*` 규칙으로 이미 보호됨

## Secret Manager 시크릿 목록 (App Hosting용)
FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID

## Key File Paths
- `/apphosting.yaml` — App Hosting 런타임/환경변수 설정
- `/firebase.json` — Firebase CLI 설정
- `/.firebaserc` — 프로젝트 alias
- `/next.config.ts` — standalone 출력 모드
