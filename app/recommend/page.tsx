"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookRecommendation } from "../../types/book";

/**
 * `GET /api/recommend`が読み取れないエラー（500）で失敗した場合の汎用日本語エラー文言。
 * `app/page.tsx`・`app/graph/page.tsx`と同様、技術的なエラー文言はそのまま出さない方針。
 */
const GENERIC_ERROR_MESSAGE =
  "おすすめ本の取得に失敗しました。時間をおいて再度お試しください。";

/**
 * おすすめ本画面（タスク25）。
 *
 * この機能はClaude APIの呼び出しを伴いコストが発生するため、画面を開いた時点では
 * 一切取得しない（BRIEF上の「オンデマンドのおすすめ本生成」方針）。ユーザーが
 * 「おすすめを見る」ボタンを押した時に初めて`GET /api/recommend`を呼び出す。
 *
 * `recommendations`は3状態を区別するため`null`（未取得）と`[]`（取得したが0件）を
 * 使い分ける。0件はエラーではなく正常系の応答（タスク16で確認済み）。
 */
export default function RecommendPage() {
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<
    BookRecommendation[] | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFetchRecommendations() {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/recommend");

      if (response.status === 401) {
        // proxy.tsはAPIルートに対してリダイレクトせずJSONで401を返す設計のため、
        // ページ側でこの応答を受けて明示的にログイン画面へ遷移させる（app/page.tsxと同様）。
        router.push("/login");
        return;
      }

      if (!response.ok) {
        setError(GENERIC_ERROR_MESSAGE);
        return;
      }

      const data: unknown = await response.json();
      setRecommendations(Array.isArray(data) ? (data as BookRecommendation[]) : []);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }

  const hasFetchedOnce = recommendations !== null;
  const buttonLabel = isLoading
    ? "考え中…"
    : hasFetchedOnce
      ? "もう一度探す"
      : "おすすめを見る";

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
        <Link
          href="/"
          className="flex h-11 min-h-11 items-center justify-center rounded-lg px-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          ← 一覧に戻る
        </Link>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          おすすめ本
        </h1>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center gap-4 pb-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            記録済みの本の傾向から、まだ読んでいなさそうな本を提案します。
          </p>
          <button
            type="button"
            onClick={handleFetchRecommendations}
            disabled={isLoading}
            className="flex h-11 min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {buttonLabel}
          </button>
        </div>

        {isLoading && (
          <ul
            aria-hidden="true"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: 3 }).map((_, index) => (
              <li
                key={`skeleton-${index}`}
                className="flex min-h-[44px] flex-col gap-2 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900"
              >
                <span className="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <span className="h-3 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                <span className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {!error && recommendations !== null && recommendations.length === 0 && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            おすすめが見つかりませんでした。時間をおいて再度お試しください。
          </p>
        )}

        {!error && recommendations !== null && recommendations.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((recommendation, index) => (
              <li
                key={`${recommendation.title}-${index}`}
                className="flex min-h-[44px] flex-col gap-2 rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-900"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {recommendation.title}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {recommendation.author}
                </span>
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  {recommendation.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
