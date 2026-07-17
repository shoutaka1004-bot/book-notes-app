import { describe, it, expect, vi } from "vitest";
import { GET } from "./route";
import type { BookRecommendation } from "../../../types/book";

// このルート自身の新しいロジック（getBookRecommendationsが投げた値の型に応じた
// ステータスコード分岐）だけを検証する。lib/recommend.ts内部のロジック（プロンプト
// 組み立て・レスポンス解析等）はタスク11でDI経由のテスト済みのため、ここでは
// getBookRecommendations自体をモックし、実際のSupabase・Anthropic APIには一切接続しない。
const { getBookRecommendationsMock } = vi.hoisted(() => ({
  getBookRecommendationsMock: vi.fn(),
}));

vi.mock("../../../lib/recommend", () => ({
  getBookRecommendations: getBookRecommendationsMock,
}));

describe("GET /api/recommend", () => {
  it("returns 200 with the recommendation array on success", async () => {
    const recommendations: BookRecommendation[] = [
      { title: "新しい本Y", author: "著者Y", reason: "傾向が近いため" },
    ];
    getBookRecommendationsMock.mockResolvedValueOnce(recommendations);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(recommendations);
  });

  it("returns 500 with the Error's message when getBookRecommendations rejects with an Error", async () => {
    getBookRecommendationsMock.mockRejectedValueOnce(
      new Error("ANTHROPIC_API_KEY が設定されていません。.env.local を確認してください。")
    );

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(
      "ANTHROPIC_API_KEY が設定されていません。.env.local を確認してください。"
    );
  });

  it("returns 500 with a fallback message when a non-Error value is rejected", async () => {
    getBookRecommendationsMock.mockRejectedValueOnce("something went wrong");

    const res = await GET();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("おすすめ本の取得に失敗しました");
  });
});
