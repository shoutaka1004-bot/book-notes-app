"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Book, BookLinkWithBook } from "../../types/book";

/** `GET /api/links`・`GET /api/books`が読み取れないエラーで失敗した場合の汎用日本語エラー文言。 */
const GENERIC_LOAD_ERROR_MESSAGE =
  "関連本の情報の取得に失敗しました。時間をおいて再度お試しください。";

/** `POST /api/links`向けの汎用エラー文言。 */
const GENERIC_ADD_ERROR_MESSAGE =
  "関連本の追加に失敗しました。時間をおいて再度お試しください。";

/** `DELETE /api/links`向けの汎用エラー文言。 */
const GENERIC_REMOVE_ERROR_MESSAGE =
  "関連本の解除に失敗しました。時間をおいて再度お試しください。";

const selectClassName =
  "h-12 min-h-11 w-full rounded-lg border border-zinc-300 px-4 text-base text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";
const inputClassName =
  "h-12 min-h-11 w-full rounded-lg border border-zinc-300 px-4 text-base text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50";

/** 関連度選択ラジオボタンの各`<label>`。44×44px相当の実効タップ領域を確保する（BRIEF第4-7節）。 */
const strengthLabelClassName =
  "flex h-11 min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm text-zinc-700 transition-colors has-[:checked]:border-zinc-500 has-[:checked]:bg-zinc-100 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:has-[:checked]:border-zinc-400 dark:has-[:checked]:bg-zinc-800";

const STRENGTH_OPTIONS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: "弱い" },
  { value: 2, label: "普通" },
  { value: 3, label: "強い" },
];

/**
 * レスポンス（`{ error: string }`形式を想定）から日本語エラーメッセージを取り出す。
 * 取り出せない場合はフォールバックの汎用文言を返す。
 */
async function extractErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
  } catch {
    // レスポンスがJSONとして読めない場合は汎用メッセージのままにする。
  }
  return fallback;
}

/**
 * 本の詳細画面から呼び出す、関連本（リンク）の追加・解除を行う独立コンポーネント（タスク23）。
 *
 * - 既存リンク一覧: `GET /api/links?bookId=`（`direction`の向きはUI上区別せず、
 *   どちらも同列の「関連本」として表示する）
 * - 追加候補: `GET /api/books`（全件）から「自分自身」と「既にリンク済みの本」を除外して算出
 * - 追加: `POST /api/links`、解除: `DELETE /api/links`
 *
 * 本体の削除（タスク22）と異なり、解除は`window.confirm`を挟まない（可逆的で低リスクな操作のため）。
 * 解除エラーの表示は、行ごとではなくコンポーネント下部の共通1箇所にまとめる（親AI承認済みの方針、
 * 複数行のエラーを個別に出す複雑さは今回のスコープに見合わないと判断）。
 */
export function LinkManager({ bookId }: { bookId: string }) {
  const router = useRouter();

  const [links, setLinks] = useState<BookLinkWithBook[] | null>(null);
  const [allBooks, setAllBooks] = useState<Pick<Book, "id" | "title" | "author">[] | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedBookId, setSelectedBookId] = useState("");
  const [note, setNote] = useState("");
  const [strength, setStrength] = useState<1 | 2 | 3>(2);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadError(null);
      try {
        const [linksResponse, booksResponse] = await Promise.all([
          fetch(`/api/links?bookId=${bookId}`),
          fetch("/api/books"),
        ]);

        if (linksResponse.status === 401 || booksResponse.status === 401) {
          router.push("/login");
          return;
        }

        if (!linksResponse.ok || !booksResponse.ok) {
          if (!cancelled) {
            setLoadError(GENERIC_LOAD_ERROR_MESSAGE);
          }
          return;
        }

        const linksData: BookLinkWithBook[] = await linksResponse.json();
        const booksData: Book[] = await booksResponse.json();
        if (!cancelled) {
          setLinks(linksData);
          setAllBooks(booksData.map((b) => ({ id: b.id, title: b.title, author: b.author })));
        }
      } catch {
        if (!cancelled) {
          setLoadError(GENERIC_LOAD_ERROR_MESSAGE);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [bookId, router]);

  const candidates =
    allBooks && links
      ? allBooks.filter(
          (b) => b.id !== bookId && !links.some((link) => link.book.id === b.id)
        )
      : null;

  // 候補が変わって現在選択中のIDが候補から消えた場合（追加直後など）は、レンダー中に
  // 先頭候補へフォールバックする（`useEffect`でのsetState連鎖を避けるため、render中の
  // 派生値として計算する。ユーザーが`<select>`を操作した場合は`onChange`が直接
  // `selectedBookId`を更新する）。
  const effectiveSelectedBookId =
    candidates && candidates.some((c) => c.id === selectedBookId)
      ? selectedBookId
      : (candidates?.[0]?.id ?? "");

  async function handleAdd() {
    if (isAdding || !effectiveSelectedBookId) {
      return;
    }
    const targetBookId = effectiveSelectedBookId;

    setAddError(null);
    setIsAdding(true);
    try {
      const trimmedNote = note.trim();
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_book_id: bookId,
          to_book_id: targetBookId,
          strength,
          ...(trimmedNote ? { note: trimmedNote } : {}),
        }),
      });

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (response.status === 201) {
        const created: { id: string; note: string | null; strength: number } =
          await response.json();
        const addedBook = allBooks?.find((b) => b.id === targetBookId);
        if (addedBook) {
          setLinks((current) => [
            ...(current ?? []),
            {
              linkId: created.id,
              note: created.note,
              strength: created.strength,
              direction: "outgoing",
              book: addedBook,
            },
          ]);
        }
        setNote("");
        setStrength(2);
        return;
      }

      setAddError(await extractErrorMessage(response, GENERIC_ADD_ERROR_MESSAGE));
    } catch {
      setAddError(GENERIC_ADD_ERROR_MESSAGE);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(linkId: string) {
    if (deletingLinkId) {
      return;
    }

    setRemoveError(null);
    setDeletingLinkId(linkId);
    try {
      const response = await fetch("/api/links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: linkId }),
      });

      if (response.status === 401) {
        router.push("/login");
        return;
      }

      if (response.status === 200) {
        setLinks((current) => (current ?? []).filter((link) => link.linkId !== linkId));
        return;
      }

      setRemoveError(await extractErrorMessage(response, GENERIC_REMOVE_ERROR_MESSAGE));
    } catch {
      setRemoveError(GENERIC_REMOVE_ERROR_MESSAGE);
    } finally {
      setDeletingLinkId(null);
    }
  }

  const isLoading = !loadError && (links === null || allBooks === null);

  return (
    <section className="flex flex-col gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">関連本</h2>

      {isLoading && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中…</p>
      )}

      {loadError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {loadError}
        </p>
      )}

      {links && candidates && (
        <>
          {links.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              関連本はまだありません。
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {links.map((link) => (
                <li
                  key={link.linkId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-2 dark:border-zinc-800"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {link.book.title}
                      {link.book.author && (
                        <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                          （{link.book.author}）
                        </span>
                      )}
                    </span>
                    {link.note && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {link.note}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(link.linkId)}
                    disabled={deletingLinkId === link.linkId}
                    className="flex h-11 min-h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {deletingLinkId === link.linkId ? "解除中…" : "解除"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {removeError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {removeError}
            </p>
          )}

          {candidates.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              追加できる本がありません。
            </p>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="link-candidate"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  関連させる本
                </label>
                <select
                  id="link-candidate"
                  value={effectiveSelectedBookId}
                  onChange={(event) => setSelectedBookId(event.target.value)}
                  disabled={isAdding}
                  className={selectClassName}
                >
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                      {candidate.author ? `（${candidate.author}）` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  関連度
                </span>
                <div className="flex gap-2" role="radiogroup" aria-label="関連度">
                  {STRENGTH_OPTIONS.map((option) => (
                    <label key={option.value} className={strengthLabelClassName}>
                      <input
                        type="radio"
                        name="link-strength"
                        value={option.value}
                        checked={strength === option.value}
                        onChange={() => setStrength(option.value)}
                        disabled={isAdding}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="link-note"
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  一言メモ（任意）
                </label>
                <input
                  id="link-note"
                  type="text"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  disabled={isAdding}
                  className={inputClassName}
                />
              </div>

              {addError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  {addError}
                </p>
              )}

              <button
                type="button"
                onClick={handleAdd}
                disabled={isAdding || !effectiveSelectedBookId}
                className="flex h-11 min-h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {isAdding ? "追加中…" : "追加する"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
