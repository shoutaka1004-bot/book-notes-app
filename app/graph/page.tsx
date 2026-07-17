"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { Book, BookLink } from "../../types/book";
import { computeGraphLayout, type GraphLinkInput, type GraphNodeInput } from "./graphLayout";

/** `GET /api/books`・`GET /api/links`が読み取れないエラーで失敗した場合の汎用日本語エラー文言。 */
const GENERIC_LOAD_ERROR_MESSAGE =
  "相関図の読み込みに失敗しました。時間をおいて再度お試しください。";

/** SVG描画側の論理キャンバスサイズ（`layout.ts`のCANVAS_WIDTH/HEIGHTと一致させる）。 */
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

/** ノード円の半径。タップ領域確保のため、装飾目的より大きめに取っている（第4章再発防止チェック参照）。 */
const NODE_RADIUS = 20;

/**
 * 本のつながりの相関図画面（タスク24）。
 *
 * - ノード: `GET /api/books`（全件）の各本
 * - エッジ: `GET /api/links`（`bookId`省略、タスク24で拡張した全件取得）の各リンク
 * - レイアウト計算は`./graphLayout.ts`の`computeGraphLayout`（d3-forceベースの純粋関数）に委譲し、
 *   このコンポーネントは計算済みの座標を素のSVG（`<circle>`/`<line>`/`<text>`）として
 *   描画するだけに徹する。
 * - 各ノードはクリック/Enterキーでその本の詳細画面（`/books/[id]`）へ遷移する。
 */
export default function GraphPage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [links, setLinks] = useState<BookLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const [booksResponse, linksResponse] = await Promise.all([
          fetch("/api/books"),
          fetch("/api/links"),
        ]);

        if (booksResponse.status === 401 || linksResponse.status === 401) {
          router.push("/login");
          return;
        }

        if (!booksResponse.ok || !linksResponse.ok) {
          if (!cancelled) {
            setError(GENERIC_LOAD_ERROR_MESSAGE);
          }
          return;
        }

        const booksData: Book[] = await booksResponse.json();
        const linksData: BookLink[] = await linksResponse.json();
        if (!cancelled) {
          setBooks(booksData);
          setLinks(linksData);
        }
      } catch {
        if (!cancelled) {
          setError(GENERIC_LOAD_ERROR_MESSAGE);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const layout = useMemo(() => {
    if (!books || !links) {
      return null;
    }
    const nodeInputs: GraphNodeInput[] = books.map((book) => ({
      id: book.id,
      title: book.title,
    }));
    const linkInputs: GraphLinkInput[] = links.map((link) => ({
      source: link.from_book_id,
      target: link.to_book_id,
    }));
    return computeGraphLayout(nodeInputs, linkInputs);
  }, [books, links]);

  function goToBook(bookId: string) {
    router.push(`/books/${bookId}`);
  }

  function handleNodeKeyDown(event: KeyboardEvent<SVGGElement>, bookId: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goToBook(bookId);
    }
  }

  const isLoading = !error && (books === null || links === null);

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
          本のつながり相関図
        </h1>
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

        {layout && books !== null && books.length > 0 && (
          <div className="overflow-x-auto rounded-xl bg-white p-2 shadow-sm dark:bg-zinc-900">
            <svg
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              width="100%"
              style={{ height: "auto" }}
              role="img"
              aria-label="本のつながりの相関図"
            >
              {layout.links.map((link) => (
                <line
                  key={`${link.source}-${link.target}`}
                  x1={link.x1}
                  y1={link.y1}
                  x2={link.x2}
                  y2={link.y2}
                  className="stroke-zinc-300 dark:stroke-zinc-700"
                  strokeWidth={1.5}
                />
              ))}

              {layout.nodes.map((node) => (
                <g
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.title}の詳細を開く`}
                  onClick={() => goToBook(node.id)}
                  onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
                  className="cursor-pointer focus:outline-none"
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    className="fill-zinc-900 stroke-white transition-opacity hover:opacity-80 focus:opacity-80 dark:fill-zinc-50 dark:stroke-zinc-900"
                    strokeWidth={2}
                  />
                  <text
                    x={node.x}
                    y={node.y + NODE_RADIUS + 14}
                    textAnchor="middle"
                    className="select-none fill-zinc-700 text-[11px] dark:fill-zinc-300"
                  >
                    {node.title}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )}
      </main>
    </div>
  );
}
