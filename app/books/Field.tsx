import type { ReactNode } from "react";

/**
 * フォームの各入力項目を統一したラベル・エラー表示・補足テキストで包むための小さな
 * プレゼンテーション用コンポーネント（`react-hook-form`等は未導入のため、素の`useState` per-field
 * パターンに合わせて表示部分だけを共通化する）。
 *
 * `app/books/new/page.tsx`（新規登録フォーム）と`app/books/[id]/page.tsx`（詳細・編集フォーム）の
 * 両方から共有される（タスク22で`new/page.tsx`から切り出し）。
 */
export function Field({
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
