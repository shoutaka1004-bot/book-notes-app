import { XMLParser } from "fast-xml-parser";
import type { BookSearchResult } from "../types/book";

const NDL_OPENSEARCH_ENDPOINT = "https://ndlsearch.ndl.go.jp/api/opensearch";
const DEFAULT_LIMIT = 20;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/**
 * 書名・著者のキーワードから、NDL Search（国立国会図書館サーチ）の書誌候補一覧を取得する。
 *
 * NDL SearchのOpenSearch APIは、複数の検索項目（title/creatorなど）を1回のリクエストで
 * OR検索することができない仕様である（項目間の論理条件は常にAND）。また、全項目を対象にした
 * `any`パラメータは、書名のような複数文字の語句に対してはあいまい一致のノイズが大きく、
 * 実用に耐えないことが実測で確認されている（例:「コンビニ人間」で検索しても、実際の本が
 * 上位10件はおろか取得件数内にも入らない）。一方、著者名のような固有名詞的なキーワードには
 * `any`でもそれなりに機能するが、書名検索の精度を優先し、書名項目（title）と著者項目
 * （creator）へそれぞれ個別にリクエストし、結果をマージ・重複排除して返す方針にしている。
 *
 * @param keyword 書名または著者名として入力されたキーワード（空文字・空白のみの場合は
 *   APIを呼ばず空配列を返す）
 * @param options.limit 各リクエスト（title検索・creator検索それぞれ）における取得件数上限。
 *   省略時は20件。マージ後の合計件数はこれの最大2倍になりうる（重複排除後はそれ以下になる）。
 */
export async function searchBooksByKeyword(
  keyword: string,
  options?: { limit?: number }
): Promise<BookSearchResult[]> {
  const trimmed = keyword.trim();
  if (!trimmed) {
    return [];
  }

  const limit = options?.limit ?? DEFAULT_LIMIT;

  const [byTitle, byCreator] = await Promise.all([
    fetchCandidates("title", trimmed, limit),
    fetchCandidates("creator", trimmed, limit),
  ]);

  return dedupe([...byTitle, ...byCreator]);
}

/**
 * NDL SearchのOpenSearch APIへ、指定した1項目（title または creator）でリクエストする。
 * `mediatype=books`を常に付与し、雑誌記事・録音資料等の書籍以外の資料種別を除外する。
 */
async function fetchCandidates(
  field: "title" | "creator",
  keyword: string,
  limit: number
): Promise<BookSearchResult[]> {
  const url = `${NDL_OPENSEARCH_ENDPOINT}?${field}=${encodeURIComponent(keyword)}&mediatype=books&cnt=${limit}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(`NDL Searchへの通信に失敗しました（${field}検索）`, { cause });
  }

  if (!response.ok) {
    throw new Error(
      `NDL Searchへの問い合わせに失敗しました（${field}検索、HTTP ${response.status}）`
    );
  }

  const xml = await response.text();
  return parseOpenSearchResponse(xml);
}

/**
 * OpenSearchのレスポンス（RSS2.0拡張のXML）を`BookSearchResult`の配列に変換する。
 */
function parseOpenSearchResponse(xml: string): BookSearchResult[] {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (cause) {
    throw new Error("NDL Searchのレスポンス（XML）の解析に失敗しました", { cause });
  }

  const items = toArray(
    (parsed as { rss?: { channel?: { item?: unknown } } })?.rss?.channel?.item
  );

  return items
    .map((item) => toBookSearchResult(item))
    .filter((result): result is BookSearchResult => result !== null);
}

function toBookSearchResult(item: unknown): BookSearchResult | null {
  if (!isRecord(item)) {
    return null;
  }

  const title = textOf(item["dc:title"]);
  if (!title) {
    // タイトルが取れない結果は候補として不完全なため除外する
    return null;
  }

  const author = joinTexts(item["dc:creator"]);
  const publisher = joinTexts(item["dc:publisher"]);
  const isbn = extractIsbn(item["dc:identifier"]);

  return { title, author, publisher, isbn };
}

/**
 * `dc:identifier`（複数出現し、xsi:type属性でISBN/ISBN13/NDLBibID等を区別する）から
 * ISBNを取り出す。13桁（ISBN13）を優先し、無ければ10桁等の`dcndl:ISBN`を使う。
 * ハイフンは正規化のため除去する。
 */
function extractIsbn(identifierField: unknown): string | null {
  const identifiers = toArray(identifierField).filter(isRecord);

  const isbn13 = identifiers.find((id) => id["@_xsi:type"] === "dcndl:ISBN13");
  const isbn10 = identifiers.find((id) => id["@_xsi:type"] === "dcndl:ISBN");
  const chosen = isbn13 ?? isbn10;

  const raw = chosen ? textOf(chosen) : null;
  return raw ? raw.replace(/-/g, "") : null;
}

/**
 * title検索・creator検索の結果をマージした上で重複を除く。
 * ISBNが両方にあればISBN一致、無ければ「タイトル＋出版社」の組み合わせで同一候補とみなす。
 */
function dedupe(results: BookSearchResult[]): BookSearchResult[] {
  const seen = new Set<string>();
  const deduped: BookSearchResult[] = [];

  for (const result of results) {
    const key = result.isbn
      ? `isbn:${result.isbn}`
      : `title-publisher:${result.title}::${result.publisher ?? ""}`;

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(result);
  }

  return deduped;
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 単一のテキストノードを文字列に変換する。fast-xml-parserは値によって文字列・数値・
 * `{ "#text": ..., "@_xxx": ... }`形式のいずれかを返すため、ここで吸収する。
 */
function textOf(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (isRecord(value)) {
    return textOf((value as { "#text"?: unknown })["#text"]);
  }
  const str = String(value).trim();
  return str === "" ? null : str;
}

/**
 * `dc:creator`/`dc:publisher`のように単一または複数出現しうる項目を、
 * `; `区切りの1つの文字列にまとめる（`Book.author`が単一文字列である設計に合わせている）。
 */
function joinTexts(value: unknown): string | null {
  const texts = toArray(value)
    .map((entry) => textOf(entry))
    .filter((text): text is string => text !== null);

  return texts.length > 0 ? texts.join("; ") : null;
}
