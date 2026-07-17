import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "./route";
import { createBook, deleteBook } from "../../../../lib/db/books";

// テストごとに作成した本のIDを記録し、後始末で必ず削除する（route.test.ts と同じ流儀）。
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

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function putRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/books/dummy", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawPutRequest(rawBody: string): NextRequest {
  return new NextRequest("http://localhost/api/books/dummy", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
const MALFORMED_ID = "not-a-valid-uuid";

describe("GET /api/books/[id]", () => {
  it("returns 200 with the book when it exists", async () => {
    const created = await createBook({ title: "詳細取得確認用の本" });
    createdBookIds.push(created.id);

    const res = await GET(
      new NextRequest(`http://localhost/api/books/${created.id}`),
      makeContext(created.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
    expect(body.title).toBe("詳細取得確認用の本");
  });

  it("returns 404 when the book does not exist", async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/books/${NON_EXISTENT_UUID}`),
      makeContext(NON_EXISTENT_UUID)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when the id is not a valid UUID", async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/books/${MALFORMED_ID}`),
      makeContext(MALFORMED_ID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

describe("PUT /api/books/[id]", () => {
  it("updates a book and returns 200 with the updated record", async () => {
    const created = await createBook({ title: "更新前タイトル（APIルート）" });
    createdBookIds.push(created.id);

    const res = await PUT(
      putRequest({ title: "更新後タイトル（APIルート）", rating: 4 }),
      makeContext(created.id)
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe("更新後タイトル（APIルート）");
    expect(updated.rating).toBe(4);

    // 更新内容がGETにも正しく反映されていることを確認する（データの流れの一貫性）。
    const getRes = await GET(
      new NextRequest(`http://localhost/api/books/${created.id}`),
      makeContext(created.id)
    );
    const fetched = await getRes.json();
    expect(fetched.title).toBe("更新後タイトル（APIルート）");
    expect(fetched.rating).toBe(4);
  });

  it("allows partial updates with only one field set", async () => {
    const created = await createBook({
      title: "部分更新確認用の本",
      author: "元の著者",
    });
    createdBookIds.push(created.id);

    const res = await PUT(putRequest({ author: "更新後の著者" }), makeContext(created.id));
    expect(res.status).toBe(200);
    const updated = await res.json();
    // 指定したフィールドのみ更新され、他のフィールドは変わらない
    expect(updated.title).toBe("部分更新確認用の本");
    expect(updated.author).toBe("更新後の著者");
  });

  it("returns 400 when the update body has no fields (empty object)", async () => {
    const created = await createBook({ title: "空ボディ更新テスト" });
    createdBookIds.push(created.id);

    const res = await PUT(putRequest({}), makeContext(created.id));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 404 when the book does not exist", async () => {
    const res = await PUT(
      putRequest({ title: "存在しない本への更新" }),
      makeContext(NON_EXISTENT_UUID)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when the id is not a valid UUID", async () => {
    const res = await PUT(
      putRequest({ title: "不正ID更新テスト" }),
      makeContext(MALFORMED_ID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when rating is outside the 1-5 range", async () => {
    const created = await createBook({ title: "評価範囲外テスト（PUT）" });
    createdBookIds.push(created.id);

    const res = await PUT(putRequest({ rating: 6 }), makeContext(created.id));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const created = await createBook({ title: "不正JSONテスト（PUT）" });
    createdBookIds.push(created.id);

    const res = await PUT(rawPutRequest("{not-json"), makeContext(created.id));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("リクエストボディがJSONとして解析できません");
  });
});

describe("DELETE /api/books/[id]", () => {
  it("deletes a book and returns 200 with success:true, then GET returns 404", async () => {
    const created = await createBook({ title: "削除確認用の本（APIルート）" });

    const res = await DELETE(
      new NextRequest(`http://localhost/api/books/${created.id}`, {
        method: "DELETE",
      }),
      makeContext(created.id)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });

    const getRes = await GET(
      new NextRequest(`http://localhost/api/books/${created.id}`),
      makeContext(created.id)
    );
    expect(getRes.status).toBe(404);
  });

  it("returns 404 when the book does not exist", async () => {
    const res = await DELETE(
      new NextRequest(`http://localhost/api/books/${NON_EXISTENT_UUID}`, {
        method: "DELETE",
      }),
      makeContext(NON_EXISTENT_UUID)
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when the id is not a valid UUID", async () => {
    const res = await DELETE(
      new NextRequest(`http://localhost/api/books/${MALFORMED_ID}`, {
        method: "DELETE",
      }),
      makeContext(MALFORMED_ID)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
