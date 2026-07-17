import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// このテストは（NDL Search障害のケースを除き）実際のNDL Search（国立国会図書館サーチ）
// APIへ疎通する。lib/bookSearch.test.ts と同じ方針で、ネットワーク越しの実呼び出しの
// ケースには個別に長めのタイムアウトを指定する。

function getRequest(keyword: string | null): NextRequest {
  const url =
    keyword === null
      ? "http://localhost/api/book-search"
      : `http://localhost/api/book-search?keyword=${encodeURIComponent(keyword)}`;
  return new NextRequest(url);
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("GET /api/book-search", () => {
  it("returns 400 when keyword is missing", async () => {
    const res = await GET(getRequest(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when keyword is an empty string", async () => {
    const res = await GET(getRequest(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when keyword is whitespace only", async () => {
    const res = await GET(getRequest("   "));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it(
    "returns 200 with matching candidates for a real, well-known book title",
    async () => {
      // 村田沙耶香「コンビニ人間」（実在・文藝春秋刊）。lib/bookSearch.test.ts と同じ実例を使う。
      const res = await GET(getRequest("コンビニ人間"));
      expect(res.status).toBe(200);

      const results = await res.json();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(
        results.some(
          (r: { title: string; author: string | null }) =>
            r.title === "コンビニ人間" && r.author?.includes("村田")
        )
      ).toBe(true);
    },
    15000
  );

  it(
    "returns 200 with an empty array when no candidates match",
    async () => {
      // 実在しないであろう無意味な文字列で検索し、該当0件（エラーではない）を確認する。
      const res = await GET(
        getRequest("ザゼズゾザゼズゾ存在しないタイトルxyz123")
      );
      expect(res.status).toBe(200);
      const results = await res.json();
      expect(results).toEqual([]);
    },
    20000
  );

  it("returns 502 when NDL Search itself fails (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const res = await GET(getRequest("コンビニ人間"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
