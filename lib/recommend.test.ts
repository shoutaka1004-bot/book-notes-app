import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  buildRecommendPrompt,
  getBookRecommendations,
  parseRecommendResponse,
} from "./recommend";
import type { Book } from "../types/book";

// このテストは実際のSupabase・Claude APIへは一切接続しない。
// `ANTHROPIC_API_KEY` が未設定の環境（このプロジェクトの現状）でも問題なく通ることを
// 確認するため、`getBookRecommendations` は依存性注入（`listBooksFn` / `client`）で
// モックに差し替えてテストする。

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "テスト用の本",
    author: "テスト太郎",
    publisher: null,
    isbn: null,
    cover_url: null,
    rating: 4,
    one_line_summary: "テスト用の一言要約",
    content_summary: null,
    why_resonated: "テスト用の理由",
    how_to_apply: null,
    surprising_point: null,
    quote: null,
    tags: ["テスト"],
    finished_date: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRecommendPrompt", () => {
  it("includes each recorded book's title as part of the NG (already-read) list", () => {
    const books = [
      makeBook({ title: "コンビニ人間", author: "村田沙耶香" }),
      makeBook({ title: "おにぎりレシピ101", author: "山田玲子" }),
    ];

    const prompt = buildRecommendPrompt(books);

    expect(prompt).toContain("コンビニ人間");
    expect(prompt).toContain("おにぎりレシピ101");
    // 既読リストであることが伝わる文言が含まれること
    expect(prompt).toContain("既読リスト");
  });

  it("instructs the model to suggest unread books and avoid duplicates, in a parseable JSON format", () => {
    const prompt = buildRecommendPrompt([makeBook()]);

    expect(prompt).toContain("まだ読んでいなさそうな新しい本");
    expect(prompt).toContain("提案しないでください");
    expect(prompt).toContain("JSON");
  });

  it("does not throw and returns a reasonable prompt when there are no recorded books yet", () => {
    const prompt = buildRecommendPrompt([]);

    expect(prompt).toContain("まだ記録済みの本がありません");
    expect(prompt).toContain("JSON");
  });

  it("includes rating, summary, why-resonated, and tags when present", () => {
    const prompt = buildRecommendPrompt([
      makeBook({
        rating: 5,
        one_line_summary: "衝撃的な一言要約",
        why_resonated: "登場人物への共感",
        tags: ["小説", "感動"],
      }),
    ]);

    expect(prompt).toContain("5/5");
    expect(prompt).toContain("衝撃的な一言要約");
    expect(prompt).toContain("登場人物への共感");
    expect(prompt).toContain("小説, 感動");
  });
});

describe("parseRecommendResponse", () => {
  it("parses a well-formed JSON array response", () => {
    const responseText = JSON.stringify([
      { title: "本A", author: "著者A", reason: "理由A" },
      { title: "本B", author: "著者B", reason: "理由B" },
    ]);

    const result = parseRecommendResponse(responseText);

    expect(result).toEqual([
      { title: "本A", author: "著者A", reason: "理由A" },
      { title: "本B", author: "著者B", reason: "理由B" },
    ]);
  });

  it("strips a markdown code fence (```json ... ```) before parsing", () => {
    const responseText =
      "```json\n" +
      JSON.stringify([{ title: "本C", author: "著者C", reason: "理由C" }]) +
      "\n```";

    const result = parseRecommendResponse(responseText);

    expect(result).toEqual([{ title: "本C", author: "著者C", reason: "理由C" }]);
  });

  it("strips a markdown code fence without the json language hint", () => {
    const responseText =
      "```\n" +
      JSON.stringify([{ title: "本D", author: "著者D", reason: "理由D" }]) +
      "\n```";

    const result = parseRecommendResponse(responseText);

    expect(result).toEqual([{ title: "本D", author: "著者D", reason: "理由D" }]);
  });

  it("throws a clear error (not a raw SyntaxError) for malformed JSON", () => {
    const responseText = "申し訳ありませんが、おすすめの本は次の通りです: 本A, 本B";

    expect(() => parseRecommendResponse(responseText)).toThrowError(
      /解析できませんでした/
    );
  });

  it("throws a clear error when the parsed value is not an array", () => {
    const responseText = JSON.stringify({ title: "本A", author: "著者A", reason: "理由A" });

    expect(() => parseRecommendResponse(responseText)).toThrowError(
      /解析できませんでした/
    );
  });

  it("throws a clear error when an entry is missing required fields or has the wrong type", () => {
    const responseText = JSON.stringify([{ title: "本A", author: 12345 }]);

    expect(() => parseRecommendResponse(responseText)).toThrowError(
      /解析できませんでした/
    );
  });

  it("throws a clear error for an empty array response", () => {
    const responseText = "[]";

    expect(() => parseRecommendResponse(responseText)).toThrowError(
      /解析できませんでした/
    );
  });
});

describe("getBookRecommendations", () => {
  it("builds the prompt from injected books, calls the injected client, and parses its response, without touching Supabase or the real Anthropic API", async () => {
    const books = [makeBook({ title: "既読本X", author: "著者X" })];
    const listBooksFn = vi.fn().mockResolvedValue(books);

    const createMock = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { title: "新しい本Y", author: "著者Y", reason: "傾向が近いため" },
          ]),
        },
      ],
    });
    const fakeClient = {
      messages: { create: createMock },
    } as unknown as Anthropic;

    const result = await getBookRecommendations({ listBooksFn, client: fakeClient });

    expect(listBooksFn).toHaveBeenCalledOnce();
    expect(createMock).toHaveBeenCalledOnce();
    // プロンプトに既読本のタイトルが含まれた状態でAPIが呼ばれていること
    const callArgs = createMock.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("既読本X");
    expect(callArgs.model).toBe("claude-sonnet-5");

    expect(result).toEqual([
      { title: "新しい本Y", author: "著者Y", reason: "傾向が近いため" },
    ]);
  });

  it("wraps a client-side failure (e.g. network error) in a clear error instead of crashing with the raw exception", async () => {
    const listBooksFn = vi.fn().mockResolvedValue([]);
    const createMock = vi.fn().mockRejectedValue(new Error("network down"));
    const fakeClient = {
      messages: { create: createMock },
    } as unknown as Anthropic;

    await expect(
      getBookRecommendations({ listBooksFn, client: fakeClient })
    ).rejects.toThrowError(/Claude APIへの問い合わせに失敗しました/);
  });

  it("propagates a clear parse error when the injected client returns unparseable text", async () => {
    const listBooksFn = vi.fn().mockResolvedValue([]);
    const createMock = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "not json at all" }],
    });
    const fakeClient = {
      messages: { create: createMock },
    } as unknown as Anthropic;

    await expect(
      getBookRecommendations({ listBooksFn, client: fakeClient })
    ).rejects.toThrowError(/解析できませんでした/);
  });
});
