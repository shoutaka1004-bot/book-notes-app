import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { deleteBook } from "../../../lib/db/books";

// テストごとに作成した本のIDを記録し、後始末で必ず削除する（lib/db/books.test.ts と同じ流儀）。
const createdBookIds: string[] = [];

afterEach(async () => {
  while (createdBookIds.length > 0) {
    const id = createdBookIds.pop()!;
    try {
      await deleteBook(id);
    } catch {
      // 既にテスト内で削除済みの場合はエラーを無視する
    }
  }
});

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/books", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawPostRequest(rawBody: string): NextRequest {
  return new NextRequest("http://localhost/api/books", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

describe("GET /api/books", () => {
  it("returns 200 with an array including a newly created book", async () => {
    const createRes = await POST(
      postRequest({ title: "一覧確認用の本（APIルート）" })
    );
    const created = await createRes.json();
    createdBookIds.push(created.id);

    const listRes = await GET();
    expect(listRes.status).toBe(200);
    const books = await listRes.json();
    expect(Array.isArray(books)).toBe(true);
    expect(books.some((book: { id: string }) => book.id === created.id)).toBe(
      true
    );
  });
});

describe("POST /api/books", () => {
  it("creates a book and returns 201 with the created record", async () => {
    const res = await POST(
      postRequest({
        title: "作成確認用の本（APIルート）",
        author: "テスト太郎",
        rating: 5,
        tags: ["テスト"],
        finished_date: "2026-07-01",
      })
    );
    expect(res.status).toBe(201);

    const created = await res.json();
    createdBookIds.push(created.id);

    expect(created.id).toBeTruthy();
    expect(created.title).toBe("作成確認用の本（APIルート）");
    expect(created.author).toBe("テスト太郎");
    expect(created.rating).toBe(5);
    expect(created.tags).toEqual(["テスト"]);
    expect(created.finished_date).toBe("2026-07-01");
  });

  it("returns 400 when title is missing", async () => {
    const res = await POST(postRequest({ author: "タイトル無し太郎" }));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when rating is outside the 1-5 range", async () => {
    const res = await POST(
      postRequest({ title: "評価範囲外テスト", rating: 6 })
    );
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when finished_date is not in YYYY-MM-DD format", async () => {
    const res = await POST(
      postRequest({ title: "日付形式テスト", finished_date: "2026/07/01" })
    );
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await POST(rawPostRequest("{not-json"));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("リクエストボディがJSONとして解析できません");
  });
});
