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
