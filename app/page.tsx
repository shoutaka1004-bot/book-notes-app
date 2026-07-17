"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Book } from "../types/book";

/**
 * 一覧取得に失敗した場合の汎用エラーメッセージ（技術的なエラーをそのまま出さない方針、
 * `app/login/page.tsx`と同様の方針を踏襲）。
 */
const GENERIC_ERROR_MESSAGE =
  "本の一覧の取得に失敗しました。時間をおいて再度お試しください。";

/** `rating`（1〜5、または未評価でnull）を★表記に変換する。 */
function formatRating(rating: number | null): string {
  if (rating === null) {
    return "未評価";
  }
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

/** `finished_date`（YYYY-MM-DD、または未記入でnull）の表示用文字列。値の有無に関わらず「完読日: 」ラベルを一貫して付ける。 */
function formatFinishedDate(finishedDate: string | null): string {
  return `完読日: ${finishedDate ?? "未記入"}`;
}

/**
 * 本の一覧画面（トップページ）。ログイン後に最初に表示される画面であり、
 * ログアウト・新規登録・各本の詳細への導線をここに集約する。
 */
export default function Home() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadBooks() {
      setError(null);
      try {
        const response = await fetch("/api/books");

        if (response.status === 401) {
          // セッション切れ（proxy.tsはAPIルートに対してリダイレクトせずJSONで401を返す設計のため、
          // ページ側でこの応答を受けて明示的にログイン画面へ遷移させる）。
          router.push("/login");
          return;
        }

        if (!response.ok) {
          if (!cancelled) {
            setError(GENERIC_ERROR_MESSAGE);
          }
          return;
        }

        const data: unknown = await response.json();
        if (!cancelled) {
          setBooks(Array.isArray(data) ? (data as Book[]) : []);
        }
      } catch {
        if (!cancelled) {
          setError(GENERIC_ERROR_MESSAGE);
        }
      }
    }

    loadBooks();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }
    setIsLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
    } finally {
      router.push("/login");
    }
  }

  const isLoading = books === null && error === null;

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          読書ノート
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href="/books/new"
            className="flex h-11 min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            新しく記録する
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex h-11 min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {isLoggingOut ? "ログアウト中…" : "ログアウト"}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {isLoading && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            読み込み中…
          </p>
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {books !== null && books.length === 0 && !error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              まだ記録がありません。最初の1冊を記録してみましょう。
            </p>
            <Link
              href="/books/new"
              className="flex h-11 min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              新しく記録する
            </Link>
          </div>
        )}

        {books !== null && books.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => (
              <li key={book.id}>
                <Link
                  href={`/books/${book.id}`}
                  className="flex min-h-[44px] flex-col gap-2 rounded-xl bg-white p-4 shadow-sm transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {book.title}
                  </span>
                  <span className="text-sm text-amber-500 dark:text-amber-400">
                    {formatRating(book.rating)}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {formatFinishedDate(book.finished_date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
