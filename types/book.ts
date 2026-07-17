// `books` / `book_links` テーブル（supabase/migrations/20260716141500_create_books_and_book_links.sql）
// に対応する型定義。

export interface Book {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  cover_url: string | null;
  rating: number | null;
  one_line_summary: string | null;
  content_summary: string | null;
  why_resonated: string | null;
  how_to_apply: string | null;
  surprising_point: string | null;
  quote: string | null;
  tags: string[];
  finished_date: string | null;
  created_at: string;
}

/** `books` への新規作成入力。`title` 以外は任意（DBスキーマのnullable列に対応）。 */
export interface NewBookInput {
  title: string;
  author?: string | null;
  publisher?: string | null;
  isbn?: string | null;
  cover_url?: string | null;
  rating?: number | null;
  one_line_summary?: string | null;
  content_summary?: string | null;
  why_resonated?: string | null;
  how_to_apply?: string | null;
  surprising_point?: string | null;
  quote?: string | null;
  tags?: string[];
  finished_date?: string | null;
}

/** `books` の更新入力。指定したフィールドのみ更新する。 */
export type UpdateBookInput = Partial<NewBookInput>;

/**
 * NDL Search（国立国会図書館サーチ）のキーワード検索で得られる書誌候補。
 * `lib/bookSearch.ts` の検索結果として使う。著者が複数いる場合は `; ` 区切りで1つの
 * 文字列にまとめる（`Book.author` が単一文字列であることに合わせている）。
 * 出版社・ISBNは元データに無い場合があるため `null` になりうる。
 */
export interface BookSearchResult {
  title: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
}

/**
 * openBD（ISBN指定の書誌情報API）から得られる表紙画像・出版情報。
 * `lib/openbd.ts` の取得結果として使う。該当ISBNの書誌情報が存在しない場合は
 * `getBookInfoByIsbn`自体が`null`を返す（このインターフェースの各フィールドがnullになる
 * わけではない）。openBD側にフィールドが空の場合は`null`に正規化している。
 *
 * `publishedDate`はopenBDの`summary.pubdate`をそのまま返す。書誌によって桁数が異なり
 * （`YYYY`/`YYYYMM`/`YYYYMMDD`いずれもありうることを実測で確認済み）、日付型への変換は
 * ここでは行わないため、表示・加工は呼び出し側の責務とする。
 */
export interface OpenBdBookInfo {
  isbn: string;
  title: string | null;
  author: string | null;
  publisher: string | null;
  coverUrl: string | null;
  publishedDate: string | null;
}

/**
 * Claude API（`lib/recommend.ts`）による、おすすめ本の提案1件分。
 * `reason`はなぜその本を勧めるのか（記録済みの本の傾向を踏まえた理由）を表す。
 */
export interface BookRecommendation {
  title: string;
  author: string;
  reason: string;
}

export interface BookLink {
  id: string;
  from_book_id: string;
  to_book_id: string;
  note: string | null;
}

/**
 * ある本を起点に見た、リンク先/リンク元の本の情報。
 * `book_links` は片方向で保存されるが、相関図・詳細画面では双方向に扱うため、
 * 起点となる本から見た「相手の本」の情報とリンクの向きを含めて返す。
 */
export interface BookLinkWithBook {
  linkId: string;
  note: string | null;
  direction: "outgoing" | "incoming";
  book: Pick<Book, "id" | "title" | "author">;
}
