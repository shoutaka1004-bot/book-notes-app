import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * ログインCookieの名前。middleware・login/logoutルートでもこの名前を使う。
 */
export const AUTH_COOKIE_NAME = "book_notes_session";

/**
 * セッションの既定の有効期限（30日）。個人利用の単一パスワード方式のため長めに設定している。
 */
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} が設定されていません。.env.local を確認してください。`);
  }
  return value;
}

/**
 * 固定長のダイジェストに変換した上で timingSafeEqual を使う。
 * 入力の長さが異なっていても例外にならず、かつタイミング攻撃を避けられる。
 */
function safeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * 入力されたパスワードが `APP_PASSWORD` と一致するか検証する。
 */
export function verifyPassword(password: string): boolean {
  const expected = getRequiredEnv("APP_PASSWORD");
  return safeEqual(password, expected);
}

type SessionPayload = {
  exp: number;
};

function sign(payloadBase64: string): string {
  const secret = getRequiredEnv("AUTH_COOKIE_SECRET");
  return createHmac("sha256", secret).update(payloadBase64).digest("hex");
}

/**
 * 認証成功時に、署名付きのセッショントークン（Cookieにそのまま入れられる文字列）を発行する。
 * 形式: `<base64urlペイロード>.<HMAC-SHA256署名(16進)>`
 *
 * @param options.ttlMs 有効期間（ミリ秒）。省略時は30日。
 * @param options.nowMs 現在時刻（epoch ms）。省略時は `Date.now()`。テストで時刻を固定するために使う。
 */
export function createSessionToken(options?: { ttlMs?: number; nowMs?: number }): string {
  const nowMs = options?.nowMs ?? Date.now();
  const ttlMs = options?.ttlMs ?? DEFAULT_SESSION_TTL_MS;

  const payload: SessionPayload = { exp: nowMs + ttlMs };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(payloadBase64);

  return `${payloadBase64}.${signature}`;
}

/**
 * Cookieから受け取ったセッショントークンが正しい署名か・期限切れでないかを検証する。
 * 形式不正・署名不一致・期限切れなど、無効と判断できる場合は例外を投げず `false` を返す
 * （呼び出し側のmiddlewareで扱いやすくするため）。
 *
 * @param nowMs 現在時刻（epoch ms）。省略時は `Date.now()`。テストで期限切れを再現するために使う。
 */
export function verifySessionToken(token: string | undefined | null, nowMs?: number): boolean {
  if (!token) {
    return false;
  }

  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) {
    return false;
  }

  const payloadBase64 = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);

  if (!payloadBase64 || !signature) {
    return false;
  }

  let expectedSignature: string;
  try {
    expectedSignature = sign(payloadBase64);
  } catch {
    return false;
  }

  // 署名の比較は長さが異なる可能性があるため、まず長さを揃えてから timingSafeEqual を使う。
  // （16進のHMAC-SHA256署名は本来同じ長さになるはずだが、改ざんされた任意の文字列が来ても
  // 例外にならないよう、safeEqual と同じダイジェスト経由の比較にする）
  if (!safeEqual(signature, expectedSignature)) {
    return false;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf-8"));
  } catch {
    return false;
  }

  if (typeof payload.exp !== "number") {
    return false;
  }

  const now = nowMs ?? Date.now();
  return now < payload.exp;
}
