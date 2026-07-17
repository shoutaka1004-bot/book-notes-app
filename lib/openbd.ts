import type { OpenBdBookInfo } from "../types/book";

const OPENBD_ENDPOINT = "https://api.openbd.jp/v1/get";

/**
 * ISBNを指定して、openBD（https://openbd.jp/ ）から表紙画像URL・出版社・出版日等の
 * 書誌情報を取得する。
 *
 * openBDは該当するISBNが存在しない場合、レスポンス配列の該当要素が`null`になる仕様
 * （HTTPエラーにはならない）。この場合、またはISBNが空文字の場合はAPIを呼ばず`null`を返す。
 *
 * @param isbn ISBN文字列（ハイフンの有無は問わない。内部で除去して正規化する）
 */
export async function getBookInfoByIsbn(isbn: string): Promise<OpenBdBookInfo | null> {
  const normalized = isbn.trim().replace(/-/g, "");
  if (!normalized) {
    return null;
  }

  const url = `${OPENBD_ENDPOINT}?isbn=${encodeURIComponent(normalized)}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error("openBDへの通信に失敗しました", { cause });
  }

  if (!response.ok) {
    throw new Error(`openBDへの問い合わせに失敗しました（HTTP ${response.status}）`);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    throw new Error("openBDのレスポンス（JSON）の解析に失敗しました", { cause });
  }

  const entry = Array.isArray(parsed) ? parsed[0] : null;
  if (!isRecord(entry) || !isRecord(entry.summary)) {
    // 該当するISBNの書誌情報が無い（配列要素がnull、または想定外の形状）
    return null;
  }

  const summary = entry.summary;

  return {
    isbn: textOrNull(summary.isbn) ?? normalized,
    title: textOrNull(summary.title),
    author: textOrNull(summary.author),
    publisher: textOrNull(summary.publisher),
    coverUrl: textOrNull(summary.cover),
    publishedDate: textOrNull(summary.pubdate),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * openBDの`summary`内フィールドは存在しない場合でも空文字列として返ってくることがあるため、
 * 空文字列は`null`に正規化する。
 */
function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
