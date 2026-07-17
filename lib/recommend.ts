import Anthropic from "@anthropic-ai/sdk";
import { listBooks } from "./db/books";
import type { Book, BookRecommendation } from "../types/book";

const CLAUDE_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;

/**
 * `getBookRecommendations` の依存性注入用オプション。
 * 通常は省略してよい（本番実装のデフォルトが使われる）。テストで実際のSupabase・
 * Anthropic APIへ接続せずにロジックだけを検証するために用意している。
 */
export interface GetBookRecommendationsOptions {
  /** 記録済みの本一覧を取得する関数。省略時は `lib/db/books.ts` の `listBooks` を使う。 */
  listBooksFn?: () => Promise<Book[]>;
  /** Anthropic APIクライアント。省略時は環境変数からデフォルトのクライアントを生成する。 */
  client?: Anthropic;
}

/**
 * 記録済みの本一覧から、Claude APIに渡すプロンプトを組み立てる。
 *
 * - 記録済みの本のタイトル・著者・評価・一言要約・タグ・「なぜ刺さったか」を整形して伝える。
 * - 記録済みの本のタイトルを「既読リスト」として明示し、それらと同一の本を再提案しない
 *   よう指示することで、重複提案を避ける。
 * - 応答はJSON配列のみで返すよう厳格に指示する（自然文の説明やMarkdownのコードフェンスを
 *   含めないこと）。`parseRecommendResponse` 側でもコードフェンスの除去は行うが、
 *   プロンプト側でも極力それが発生しない形式を明示しておく。
 * - 記録済みの本が1冊も無い場合でも例外を投げず、一般的な提案を促すプロンプトを返す。
 */
export function buildRecommendPrompt(books: Book[]): string {
  const readTitles = books.map((book) => book.title);

  const recordedBooksSection =
    books.length === 0
      ? "（まだ記録済みの本がありません。特定のジャンルに偏らない、幅広い定番の本を提案してください。）"
      : books
          .map((book, index) => {
            const lines = [
              `${index + 1}. 『${book.title}』${book.author ? ` / ${book.author}` : ""}`,
              book.rating != null ? `   評価: ${book.rating}/5` : null,
              book.one_line_summary ? `   一言要約: ${book.one_line_summary}` : null,
              book.why_resonated ? `   なぜ刺さったか: ${book.why_resonated}` : null,
              book.tags.length > 0 ? `   タグ: ${book.tags.join(", ")}` : null,
            ].filter((line): line is string => line !== null);
            return lines.join("\n");
          })
          .join("\n\n");

  const ngListSection =
    readTitles.length > 0
      ? `以下は既に読んで記録済みの本のタイトル一覧です。これらと同一の本は絶対に提案しないでください（既読リスト）:\n${readTitles
          .map((title) => `- ${title}`)
          .join("\n")}`
      : "";

  return `あなたは読書アドバイザーです。以下はユーザーがこれまでに読んで記録した本の一覧です。

${recordedBooksSection}

${ngListSection}

この記録内容（評価、要約、なぜ刺さったか、タグ）の傾向を踏まえて、ユーザーがまだ読んでいなさそうな新しい本を3〜5冊、提案してください。既読リストに含まれる本は提案しないでください。

出力は必ず次の形式のJSON配列のみとし、それ以外の説明文・前置き・Markdownのコードフェンス（\`\`\`）は一切含めないでください:

[{"title": "本のタイトル", "author": "著者名", "reason": "なぜこの本を勧めるのかの理由"}]`;
}

/**
 * Claude APIのレスポンステキストを `BookRecommendation[]` にパースする。
 *
 * Claudeが稀に \`\`\`json ... \`\`\` のようなMarkdownコードフェンスで応答を包む場合が
 * あるため、まずそれを除去してからJSONとして解析する。パースに失敗した場合、または
 * 期待する形状（`title`/`author`/`reason` を持つオブジェクトの配列、1件以上）でない
 * 場合は、生の例外（`SyntaxError`等）をそのまま投げず、分かりやすい日本語メッセージの
 * `Error` を投げる。呼び出し元（APIルート・UI）はこれをそのままエラーメッセージとして
 * 表示できる。
 */
export function parseRecommendResponse(responseText: string): BookRecommendation[] {
  const stripped = stripCodeFence(responseText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (cause) {
    throw new Error(
      "おすすめ本の生成結果を解析できませんでした。時間をおいて再度お試しください。",
      { cause }
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      "おすすめ本の生成結果を解析できませんでした。時間をおいて再度お試しください。"
    );
  }

  const recommendations: BookRecommendation[] = [];
  for (const entry of parsed) {
    if (!isValidRecommendationEntry(entry)) {
      throw new Error(
        "おすすめ本の生成結果を解析できませんでした。時間をおいて再度お試しください。"
      );
    }
    recommendations.push({
      title: entry.title,
      author: entry.author,
      reason: entry.reason,
    });
  }

  return recommendations;
}

function isValidRecommendationEntry(
  value: unknown
): value is BookRecommendation {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === "string" &&
    record.title.trim() !== "" &&
    typeof record.author === "string" &&
    record.author.trim() !== "" &&
    typeof record.reason === "string"
  );
}

/**
 * 応答テキストの先頭・末尾がMarkdownのコードフェンス（\`\`\` または \`\`\`json）で
 * 囲まれている場合、それを除去する。囲まれていない場合はそのまま返す。
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

/**
 * `ANTHROPIC_API_KEY` からデフォルトのAnthropic APIクライアントを生成する。
 * 未設定の場合はSDKのインスタンス化時ではなく、この時点で分かりやすいエラーを投げる。
 */
function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。.env.local を確認してください。"
    );
  }
  return new Anthropic({ apiKey });
}

/**
 * Claudeのレスポンスからテキスト部分を連結して取り出す。
 * `content` は複数ブロックに分かれうるため、`type: "text"` のブロックのみを連結する。
 */
function extractResponseText(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * 記録済みの本を取得し、Claude APIに問い合わせて、まだ読んでいなさそうな本の
 * おすすめを取得する。
 *
 * `options.listBooksFn` / `options.client` を渡すことで、実際のSupabase・Anthropic
 * APIに接続せずロジックだけをテストできる（DI）。省略時は本番用の実装
 * （`lib/db/books.ts` の `listBooks` と、環境変数ベースのAnthropicクライアント）を使う。
 */
export async function getBookRecommendations(
  options: GetBookRecommendationsOptions = {}
): Promise<BookRecommendation[]> {
  const listBooksFn = options.listBooksFn ?? listBooks;
  const books = await listBooksFn();

  const prompt = buildRecommendPrompt(books);
  const client = options.client ?? getAnthropicClient();

  let message: Anthropic.Messages.Message;
  try {
    message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (cause) {
    throw new Error("Claude APIへの問い合わせに失敗しました", { cause });
  }

  const responseText = extractResponseText(message);
  return parseRecommendResponse(responseText);
}
