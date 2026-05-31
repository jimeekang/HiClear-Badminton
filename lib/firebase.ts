import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  experimentalLongPollingOptions: { timeoutSeconds: 10 },
});

export const auth: Auth = getAuth(app);

let _authReady: Promise<void> | null = null;
let _authWarned = false;

export function ensureAuthReady() {
  if (typeof window === "undefined") return Promise.resolve();
  if (_authReady) return _authReady;

  _authReady = new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (user) return resolve();
      try {
        await signInAnonymously(auth);
      } catch (e) {
        const err = e as { code?: string; message?: string };
        const code = err?.code ?? "";
        if (!_authWarned) {
          _authWarned = true;
          if (code === "auth/configuration-not-found") {
            console.error(
              "Firebase Authentication이 프로젝트에서 설정되지 않아(또는 비활성화되어) 익명 로그인을 할 수 없습니다. " +
                "Firebase Console → Authentication → Sign-in method에서 Anonymous를 활성화해주세요.",
              e
            );
          } else if (code === "auth/operation-not-allowed") {
            console.error(
              "익명 로그인이 비활성화되어 있습니다. Firebase Console → Authentication → Sign-in method에서 Anonymous를 활성화해주세요.",
              e
            );
          } else {
            console.error("익명 로그인 실패:", e);
          }
        }
      }
      resolve();
    });
  });

  return _authReady;
}
