"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { BookSearchResult, OpenBdBookInfo } from "../../../types/book";
import {
  bookFormSchema,
  MAX_LENGTHS,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  type RawBookFormValues,
} from "./validation";

/**
 * `/api/book-search`が返すエラーを読み取れなかった場合、または通信自体に失敗した場合に
 * 表示する汎用の日本語エラー文言（技術的なエラーをそのまま出さない方針、`app/page.tsx`・
 * `app/login/page.tsx`と同様）。
 */
const GENERIC_SEARCH_ERROR_MESSAGE =
  "書籍の検索に失敗しました。時間をおいて再度お試しください。";

/** `POST /api/books`が返すエラーを読み取れなかった場合、または通信自体に失敗した場合に
 * 表示する汎用の日本語エラー文言。 */
const GENERIC_SAVE_ERROR_MESSAGE =
  "本の登録に失敗しました。時間をおいて再度お試しください。";

const EMPTY_FORM_VALUES: RawBookFormValues = {
  title: "",
  author: "",
  publisher: "",
  rating: "",
  finished_date: "",
  one_line_summary: "",
  content_summary: "",
  why_resonated: "",
  how_to_apply: "",
  surprising_point: "",
  quote: "",
  tags: "",
};

/** フィールドごとのエラーメッセージ（`bookFormSchema`のissuesから`path[0]`単位で抽出）。 */
type FieldErrors = Partial<Record<keyof RawBookFormValues, string>>;

const inputClassName =
  "h-12 min-h-11 w-full rounded-lg border border-zinc-300 px-4 text-base text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const textareaClassName =
  "min-h-11 w-full rounded-lg border border-zinc-300 px-4 py-3 text-base text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

/**
 * フォームステップの各入力項目を統一したラベル・エラー表示・補足テキストで包むための小さな
 * プレゼンテーション用コンポーネント（`react-hook-form`等は未導入のため、素の`useState` per-field
 * パターンに合わせて表示部分だけを共通化する）。
 */
function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
        {required && <span className="ml-1 text-red-600 dark:text-red-400">*</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : (
        hint && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
        )
      )}
    </div>
  );
}

type Step = "search" | "form";

/**
 * 本の新規登録画面。検索ステップと、記録項目を入力するフォームステップの2ステップで構成する。
 * 検索ステップで選んだ候補（またはnull＝手動入力）を`selectedCandidate`として保持し、
 * フォームステップの初期値（書名・著者・出版社、ISBNがあればopenBDでの表紙・出版社の自動補完）
 * に引き継ぐ。
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

  const [formValues, setFormValues] = useState<RawBookFormValues>(EMPTY_FORM_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // 検索候補選択時（selectedCandidate.isbnがある場合）にopenBDから自動取得した表紙URL。
  // この画面に手動での表紙URL入力欄は無く、保存時のペイロードにそのまま含める。
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  /**
   * フォームステップへの遷移時に呼ぶ共通の初期化処理。`selectedCandidate`
   * （検索候補選択時はメタデータ、手動入力時はnull）を反映してフォームstateをリセットする。
   * イベントハンドラ（ユーザー操作）の中で直接呼び出す同期処理であり、useEffectでの
   * レンダー後の後追い初期化にはしない（`react-hooks/set-state-in-effect`が示す通り、
   * 導出可能な初期状態をeffect内で都度setStateするのは不要なカスケード再レンダーを招くため）。
   */
  function resetFormForCandidate(candidate: BookSearchResult | null) {
    setFormValues({
      ...EMPTY_FORM_VALUES,
      title: candidate?.title ?? "",
      author: candidate?.author ?? "",
      publisher: candidate?.publisher ?? "",
    });
    setFieldErrors({});
    setSaveError(null);
    setCoverUrl(null);
  }

  // 検索候補選択時（selectedCandidate.isbnがある場合）のみ、openBDから表紙・出版社情報を
  // 自動取得する（外部APIへの問い合わせという「外部システムとの同期」なのでuseEffectで扱う）。
  useEffect(() => {
    const isbn = selectedCandidate?.isbn;
    if (step !== "form" || !isbn) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/book-info?isbn=${encodeURIComponent(isbn)}`
        );
        if (!response.ok || cancelled) {
          // openBDでの自動取得はあくまで補助であり、失敗してもフォーム入力は継続できるため、
          // ユーザーへのエラー表示はしない（保存時のバリデーション・API疎通確認は別に検証する）。
          return;
        }
        const info: OpenBdBookInfo | null = await response.json();
        if (!info || cancelled) {
          return;
        }
        setCoverUrl(info.coverUrl);
        setFormValues((current) => ({
          ...current,
          publisher: current.publisher !== "" ? current.publisher : info.publisher ?? "",
        }));
      } catch {
        // 通信自体に失敗した場合も同様にフォーム入力の継続を優先し、無視する。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, selectedCandidate]);

  function updateField<K extends keyof RawBookFormValues>(
    field: K,
    value: RawBookFormValues[K]
  ) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const parsed = bookFormSchema.safeParse(formValues);
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in nextErrors)) {
          nextErrors[field as keyof RawBookFormValues] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      setSaveError(null);
      return;
    }

    setFieldErrors({});
    setSaveError(null);
    setIsSaving(true);

    try {
      const response = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          isbn: selectedCandidate?.isbn ?? null,
          cover_url: coverUrl,
        }),
      });

      if (response.status === 201) {
        router.push("/");
        return;
      }

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      let message = GENERIC_SAVE_ERROR_MESSAGE;
      try {
        const data: unknown = await response.json();
        if (
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
        ) {
          message = (data as { error: string }).error;
        }
      } catch {
        // レスポンスがJSONとして読めない場合は汎用メッセージのままにする。
      }
      setSaveError(message);
    } catch {
      setSaveError(GENERIC_SAVE_ERROR_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  }

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
    resetFormForCandidate(candidate);
    setStep("form");
  }

  function handleManualEntry() {
    setSelectedCandidate(null);
    resetFormForCandidate(null);
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

            <form onSubmit={handleFormSubmit} className="flex flex-col gap-5">
              <Field label="書名" htmlFor="title" error={fieldErrors.title} required>
                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  value={formValues.title}
                  onChange={(event) => updateField("title", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field label="著者" htmlFor="author" error={fieldErrors.author}>
                <input
                  id="author"
                  name="author"
                  type="text"
                  value={formValues.author}
                  onChange={(event) => updateField("author", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field label="出版社" htmlFor="publisher" error={fieldErrors.publisher}>
                <input
                  id="publisher"
                  name="publisher"
                  type="text"
                  value={formValues.publisher}
                  onChange={(event) => updateField("publisher", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field label="評価" htmlFor="rating" error={fieldErrors.rating} required>
                <select
                  id="rating"
                  name="rating"
                  required
                  value={formValues.rating}
                  onChange={(event) => updateField("rating", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                >
                  <option value="">選択してください</option>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {"★".repeat(value)}（{value}）
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="完読日"
                htmlFor="finished_date"
                error={fieldErrors.finished_date}
              >
                <input
                  id="finished_date"
                  name="finished_date"
                  type="date"
                  value={formValues.finished_date}
                  onChange={(event) =>
                    updateField("finished_date", event.target.value)
                  }
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field
                label="一言要約"
                htmlFor="one_line_summary"
                error={fieldErrors.one_line_summary}
                hint={`${formValues.one_line_summary.length}/${MAX_LENGTHS.one_line_summary}文字`}
              >
                <input
                  id="one_line_summary"
                  name="one_line_summary"
                  type="text"
                  value={formValues.one_line_summary}
                  onChange={(event) =>
                    updateField("one_line_summary", event.target.value)
                  }
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              <Field
                label="内容の要約"
                htmlFor="content_summary"
                error={fieldErrors.content_summary}
                hint={`${formValues.content_summary.length}/${MAX_LENGTHS.content_summary}文字`}
              >
                <textarea
                  id="content_summary"
                  name="content_summary"
                  rows={4}
                  value={formValues.content_summary}
                  onChange={(event) =>
                    updateField("content_summary", event.target.value)
                  }
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="なぜ刺さったか"
                htmlFor="why_resonated"
                error={fieldErrors.why_resonated}
                hint={`${formValues.why_resonated.length}/${MAX_LENGTHS.why_resonated}文字`}
              >
                <textarea
                  id="why_resonated"
                  name="why_resonated"
                  rows={3}
                  value={formValues.why_resonated}
                  onChange={(event) =>
                    updateField("why_resonated", event.target.value)
                  }
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="どう活かすか"
                htmlFor="how_to_apply"
                error={fieldErrors.how_to_apply}
                hint={`${formValues.how_to_apply.length}/${MAX_LENGTHS.how_to_apply}文字`}
              >
                <textarea
                  id="how_to_apply"
                  name="how_to_apply"
                  rows={3}
                  value={formValues.how_to_apply}
                  onChange={(event) =>
                    updateField("how_to_apply", event.target.value)
                  }
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="意外だった点"
                htmlFor="surprising_point"
                error={fieldErrors.surprising_point}
                hint={`${formValues.surprising_point.length}/${MAX_LENGTHS.surprising_point}文字`}
              >
                <textarea
                  id="surprising_point"
                  name="surprising_point"
                  rows={3}
                  value={formValues.surprising_point}
                  onChange={(event) =>
                    updateField("surprising_point", event.target.value)
                  }
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="お気に入りの一節"
                htmlFor="quote"
                error={fieldErrors.quote}
                hint={`${formValues.quote.length}/${MAX_LENGTHS.quote}文字`}
              >
                <textarea
                  id="quote"
                  name="quote"
                  rows={2}
                  value={formValues.quote}
                  onChange={(event) => updateField("quote", event.target.value)}
                  disabled={isSaving}
                  className={textareaClassName}
                />
              </Field>

              <Field
                label="タグ（カンマ区切り）"
                htmlFor="tags"
                error={fieldErrors.tags}
                hint={`最大${MAX_TAGS}個、1個あたり${MAX_TAG_LENGTH}文字まで`}
              >
                <input
                  id="tags"
                  name="tags"
                  type="text"
                  placeholder="例: 小説, 自己啓発"
                  value={formValues.tags}
                  onChange={(event) => updateField("tags", event.target.value)}
                  disabled={isSaving}
                  className={inputClassName}
                />
              </Field>

              {saveError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {saveError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="flex h-12 min-h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isSaving ? "保存中…" : "この内容で記録する"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
