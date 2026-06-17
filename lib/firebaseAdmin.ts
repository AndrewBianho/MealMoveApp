import "server-only";

export interface PushMessage {
  title: string;
  body: string;
  url: string; // relative path to open on tap, e.g. /listings/abc
}

// A sender returns how many messages delivered and which tokens FCM rejected as
// permanently invalid (so the caller can prune them). Transient failures return
// delivered: 0 with no invalid tokens, so the caller falls back to email without
// deleting good tokens.
export type PushSender = (
  tokens: string[],
  message: PushMessage
) => Promise<{ delivered: number; invalidTokens: string[] }>;

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

function configured(): boolean {
  return Boolean(PROJECT_ID && CLIENT_EMAIL && PRIVATE_KEY);
}

// Lazy, singleton admin app — only loaded/initialized when actually sending.
// firebase-admin v12+ exposes named exports; use getMessaging() from the
// firebase-admin/messaging subpath and cert/initializeApp/getApps from the root.
// Note: a rejected init promise (e.g. bad credentials) is cached, so every later
// send re-throws it — caught below as a transient failure (no pruning). Pushes
// stay silent until the process restarts; fix the credentials and redeploy.
let messagingPromise: Promise<import("firebase-admin/messaging").Messaging> | null = null;

async function getMessagingInstance() {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp, getApps, getApp, cert } = await import("firebase-admin/app");
      const { getMessaging } = await import("firebase-admin/messaging");
      const app = getApps().length
        ? getApp()
        : initializeApp({
            credential: cert({
              projectId: PROJECT_ID,
              clientEmail: CLIENT_EMAIL,
              privateKey: PRIVATE_KEY,
            }),
          });
      return getMessaging(app);
    })();
  }
  return messagingPromise;
}

// Per-token error codes that mean the token is permanently dead and should be
// pruned. `invalid-argument` is mildly ambiguous (it can also signal a malformed
// payload), but our payloads are always built from the typed PushMessage above,
// so in practice it only fires for a bad token here.
const INVALID_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export const sendMulticast: PushSender = async (tokens, message) => {
  if (tokens.length === 0) return { delivered: 0, invalidTokens: [] };
  if (!configured()) {
    console.log(`[push] would send "${message.title}" to ${tokens.length} token(s)`);
    return { delivered: 0, invalidTokens: [] };
  }
  try {
    const messaging = await getMessagingInstance();
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: message.title, body: message.body },
      webpush: { fcmOptions: { link: absoluteForSw(message.url) } },
      data: { url: message.url },
    });
    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success && r.error && INVALID_CODES.has(r.error.code)) {
        invalidTokens.push(tokens[i]);
      }
    });
    return { delivered: res.successCount, invalidTokens };
  } catch (e) {
    console.error("[push] send failed:", e);
    return { delivered: 0, invalidTokens: [] };
  }
};

// The webpush link must be absolute. Reuse APP_URL when present; otherwise leave
// the relative path (the service worker resolves it against its own origin).
function absoluteForSw(path: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}
