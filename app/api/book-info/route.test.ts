import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// このテストは（openBD障害のケースを除き）実際のopenBD APIへ疎通する。
// lib/openbd.test.ts と同じISBNを使い、既知の実測結果と一致することを確認する。
// ネットワーク越しの実呼び出しのケースには個別に長めのタイムアウトを指定する。

function getRequest(isbn: string | null): NextRequest {
  const url =
    isbn === null
      ? "http://localhost/api/book-info"
      : `http://localhost/api/book-info?isbn=${encodeURIComponent(isbn)}`;
  return new NextRequest(url);
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("GET /api/book-info", () => {
  it("returns 400 when isbn is missing", async () => {
    const res = await GET(getRequest(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when isbn is an empty string", async () => {
    const res = await GET(getRequest(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when isbn is whitespace only", async () => {
    const res = await GET(getRequest("   "));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it(
    "returns 200 with book info for a known ISBN",
    async () => {
      // 山田玲子・水野菜生「おにぎりレシピ101」（ポット出版）。lib/openbd.test.ts と同じ実例。
      const res = await GET(getRequest("9784780802047"));
      expect(res.status).toBe(200);

      const info = await res.json();
      expect(info.title).toBe("おにぎりレシピ101");
      expect(info.publisher).toBe("ポット出版");
      expect(info.coverUrl).toBe("https://cover.openbd.jp/9784780802047.jpg");
    },
    15000
  );

  it(
    "returns 200 with a null body for an ISBN that does not exist in openBD",
    async () => {
      const res = await GET(getRequest("9780000000002"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeNull();
    },
    15000
  );

  it("returns 502 when openBD itself fails (network error)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));

    const res = await GET(getRequest("9784780802047"));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
