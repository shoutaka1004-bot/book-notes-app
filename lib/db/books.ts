import { getSupabaseServiceClient } from "../supabase";
import type { Book, NewBookInput, UpdateBookInput } from "../../types/book";

/**
 * 本の一覧を取得する（新しく記録したものが先頭に来る順序）。
 * サーバー側（APIルート）専用。service role keyのクライアントを使うため、RLSは無視される。
 */
export async function listBooks(): Promise<Book[]> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`本の一覧取得に失敗しました: ${error.message}`);
  }

  return data as Book[];
}

/**
 * IDを指定して本の詳細を取得する。該当する本が存在しない場合は `null` を返す。
 */
export async function getBookById(id: string): Promise<Book | null> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`本の詳細取得に失敗しました: ${error.message}`);
  }

  return (data as Book | null) ?? null;
}

/**
 * 本を新規作成し、作成された行を返す。
 */
export async function createBook(input: NewBookInput): Promise<Book> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("books")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw new Error(`本の作成に失敗しました: ${error.message}`);
  }

  return data as Book;
}

/**
 * 本の内容を更新し、更新後の行を返す。
 */
export async function updateBook(
  id: string,
  input: UpdateBookInput
): Promise<Book> {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("books")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`本の更新に失敗しました: ${error.message}`);
  }

  return data as Book;
}

/**
 * 本を削除する。DB側の `on delete cascade` により、この本に紐づく `book_links` も
 * 併せて削除される。
 */
export async function deleteBook(id: string): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from("books").delete().eq("id", id);

  if (error) {
    throw new Error(`本の削除に失敗しました: ${error.message}`);
  }
}
