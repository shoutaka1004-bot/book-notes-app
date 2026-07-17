"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { BookSearchResult } from "../../../types/book";

/**
 * `/api/book-search`が返すエラーを読み取れなかった場合、または通信自体に失敗した場合に
 * 表示する汎用の日本語エラー文言（技術的なエラーをそのまま出さない方針、`app/page.tsx`・
 * `app/login/page.tsx`と同様）。
 */
const GENERIC_SEARCH_ERROR_MESSAGE =
  "書籍の検索に失敗しました。時間をおいて再度お試しください。";

type Step = "search" | "form";

/**
 * 本の新規登録画面。検索ステップ（このタスクの範囲）とフォームステップ（タスク21で実装）の
 * 2ステップで構成する。検索ステップで選んだ候補（またはnull＝手動入力）を`selectedCandidate`
 * として保持し、フォームステップに引き継ぐ。
 */
export default function NewBookPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("search");
  const [selectedCandidate, setSelectedCandidate] =
    useState<BookSearchResult | null>(null);

  const [keyword, setKeyword] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<BookSearchResult[] | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSearching || keyword.trim() === "") {
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await fetch(
        `/api/book-search?keyword=${encodeURIComponent(keyword.trim())}`
      );

      if (response.status === 401) {
        // proxy.tsはAPIルートに対してリダイレクトせずJSONで401を返す設計のため、
        // ページ側でこの応答を受けて明示的にログイン画面へ遷移させる（他画面と同じ方針）。
        router.push("/login");
        return;
      }

      if (!response.ok) {
        setSearchError(GENERIC_SEARCH_ERROR_MESSAGE);
        setResults(null);
        return;
      }

      const data: unknown = await response.json();
      setResults(Array.isArray(data) ? (data as BookSearchResult[]) : []);
    } catch {
      setSearchError(GENERIC_SEARCH_ERROR_MESSAGE);
      setResults(null);
    } finally {
      setHasSearched(true);
      setIsSearching(false);
    }
  }

  function handleSelectCandidate(candidate: BookSearchResult) {
    setSelectedCandidate(candidate);
    setStep("form");
  }

  function handleManualEntry() {
    setSelectedCandidate(null);
    setStep("form");
  }

  function handleBackToSearch() {
    setStep("search");
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          本を記録する
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        {step === "search" && (
          <div className="flex flex-col gap-6">
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <label htmlFor="keyword" className="sr-only">
                書名・著者名で検索
              </label>
              <input
                id="keyword"
                name="keyword"
                type="text"
                placeholder="書名・著者名で検索"
                autoFocus
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                disabled={isSearching}
                className="h-12 flex-1 rounded-lg border border-zinc-300 px-4 text-base text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
              <button
                type="submit"
                disabled={isSearching || keyword.trim() === ""}
                className="flex h-12 min-h-11 items-center justify-center rounded-lg bg-zinc-900 px-6 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isSearching ? "検索中…" : "検索"}
              </button>
            </form>

            {searchError && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {searchError}
              </p>
            )}

            {hasSearched && !searchError && results !== null && results.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                該当する本が見つかりませんでした。キーワードを変えて再度検索するか、手動で入力してください。
              </p>
            )}

            {results !== null && results.length > 0 && (
              <ul className="flex flex-col gap-2">
                {results.map((candidate, index) => (
                  <li key={`${candidate.isbn ?? candidate.title}-${index}`}>
                    <button
                      type="button"
                      onClick={() => handleSelectCandidate(candidate)}
                      className="flex min-h-11 w-full flex-col gap-1 rounded-lg bg-white p-4 text-left shadow-sm transition-colors hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        {candidate.title}
                      </span>
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        {candidate.author ?? "著者不明"}
                        {candidate.publisher ? ` / ${candidate.publisher}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleManualEntry}
                className="flex h-11 min-h-11 w-full items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                検索せず手動で入力する
              </button>
            </div>
          </div>
        )}

        {step === "form" && (
          <div className="flex flex-col gap-6">
            <button
              type="button"
              onClick={handleBackToSearch}
              className="flex h-11 min-h-11 w-fit items-center justify-center rounded-lg px-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              ← 検索に戻る
            </button>

            {selectedCandidate && (
              <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-zinc-900">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  選択した本
                </p>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {selectedCandidate.title}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {selectedCandidate.author ?? "著者不明"}
                  {selectedCandidate.publisher
                    ? ` / ${selectedCandidate.publisher}`
                    : ""}
                </p>
              </div>
            )}

            {/*
              フォーム本体はタスク21で実装する。`selectedCandidate`（手動入力の場合はnull）を
              初期値として受け取れる状態はここまでで整っている。
            */}
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              ここに登録フォームが入ります（タスク21で実装予定）。
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
