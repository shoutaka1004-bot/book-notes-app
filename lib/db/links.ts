import { getSupabaseServiceClient } from "../supabase";
import type { BookLink, BookLinkWithBook } from "../../types/book";

interface LinkedBookRow {
  id: string;
  title: string;
  author: string | null;
}

interface BookLinkRow {
  id: string;
  note: string | null;
  strength: number;
  from_book_id: string;
  to_book_id: string;
  from_book: LinkedBookRow | LinkedBookRow[] | null;
  to_book: LinkedBookRow | LinkedBookRow[] | null;
}

function firstOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value;
}

/**
 * 2冊の本の間にリンク（関連）を作成する。`book_links` は片方向で保存する。
 * `strength`（関連度、1〜3）を省略した場合はDB側のデフォルト値（2）が適用される。
 * アプリケーション側で重複してデフォルト値を持たないよう、未指定時は
 * insertペイロードに`strength`キー自体を含めない。
 */
export async function createLink(
  fromBookId: string,
  toBookId: string,
  note?: string | null,
  strength?: number
): Promise<BookLink> {
  const supabase = getSupabaseServiceClient();
  const insertPayload: Record<string, unknown> = {
    from_book_id: fromBookId,
    to_book_id: toBookId,
    note: note ?? null,
  };
  if (strength !== undefined) {
    insertPayload.strength = strength;
  }

  const { data, error } = await supabase
    .from("book_links")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    throw new Error(`本のリンク作成に失敗しました: ${error.message}`);
  }

  return data as BookLink;
}

/**
 * `book_links`テーブルの全リンクを、本情報のJOIN無しでそのまま取得する。
 * 相関図画面（`app/graph/page.tsx`）が、`GET /api/books`で別途取得した全本のノード情報と
 * 突き合わせるために使う（`listLinksForBook`のような相手本の情報は不要なため含めない）。
 */
export async function listAllLinks(): Promise<BookLink[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from("book_links").select("*");

  if (error) {
    throw new Error(`本のリンク全件取得に失敗しました: ${error.message}`);
  }

  return data as BookLink[];
}

/**
 * リンクを削除する。
 */
export async function deleteLink(id: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from("book_links").delete().eq("id", id);

  if (error) {
    throw new Error(`本のリンク削除に失敗しました: ${error.message}`);
  }
}

/**
 * 指定した本に紐づくリンクを、その本から見た向き・相手の本の情報付きで取得する。
 * `book_links` は片方向（from → to）でのみ保存されているため、この本が
 * `from_book_id` / `to_book_id` のどちらに入っていても拾えるよう `.or()` で検索し、
 * それぞれ相手側の本を "outgoing"（この本が起点） / "incoming"（この本が終点）として整形する。
 */
export async function listLinksForBook(
  bookId: string
): Promise<BookLinkWithBook[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("book_links")
    .select(
      `id, note, strength, from_book_id, to_book_id,
       from_book:books!book_links_from_book_id_fkey(id, title, author),
       to_book:books!book_links_to_book_id_fkey(id, title, author)`
    )
    .or(`from_book_id.eq.${bookId},to_book_id.eq.${bookId}`);

  if (error) {
    throw new Error(`本のリンク一覧取得に失敗しました: ${error.message}`);
  }

  const rows = data as unknown as BookLinkRow[];

  return rows.map((row) => {
    const isOutgoing = row.from_book_id === bookId;
    const otherBook = isOutgoing ? firstOf(row.to_book) : firstOf(row.from_book);

    if (!otherBook) {
      throw new Error(
        `本のリンク一覧取得結果の整形に失敗しました（リンクID: ${row.id} の相手の本が見つかりません）`
      );
    }

    return {
      linkId: row.id,
      note: row.note,
      strength: row.strength,
      direction: isOutgoing ? "outgoing" : "incoming",
      book: otherBook,
    };
  });
}
