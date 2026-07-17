import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "./route";
import { createBook, deleteBook } from "../../../lib/db/books";

// テストごとに作成した本のIDを記録し、後始末で必ず削除する（books/route.test.ts と同じ流儀）。
// book_links は books に対する on delete cascade があるため、本を削除すれば
// それに紐づくリンクも併せて削除される。
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
  return new NextRequest("http://localhost/api/links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawPostRequest(rawBody: string): NextRequest {
  return new NextRequest("http://localhost/api/links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: rawBody,
  });
}

function deleteRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/links", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(bookId: string | null): NextRequest {
  const url =
    bookId === null
      ? "http://localhost/api/links"
      : `http://localhost/api/links?bookId=${encodeURIComponent(bookId)}`;
  return new NextRequest(url);
}

const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
const MALFORMED_ID = "not-a-valid-uuid";

async function makeBook(title: string) {
  const book = await createBook({ title });
  createdBookIds.push(book.id);
  return book;
}

describe("POST /api/links", () => {
  it("creates a link and returns 201 with the created record", async () => {
    const bookA = await makeBook("リンク作成確認用A");
    const bookB = await makeBook("リンク作成確認用B");

    const res = await POST(
      postRequest({
        from_book_id: bookA.id,
        to_book_id: bookB.id,
        note: "似たテーマ",
      })
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.id).toBeTruthy();
    expect(created.from_book_id).toBe(bookA.id);
    expect(created.to_book_id).toBe(bookB.id);
    expect(created.note).toBe("似たテーマ");

    // 作成したリンクが listLinksForBook（GET経由）に双方向で反映されていることを確認する。
    const fromSideRes = await GET(getRequest(bookA.id));
    const fromSideLinks = await fromSideRes.json();
    expect(
      fromSideLinks.some(
        (link: { book: { id: string }; direction: string }) =>
          link.book.id === bookB.id && link.direction === "outgoing"
      )
    ).toBe(true);

    const toSideRes = await GET(getRequest(bookB.id));
    const toSideLinks = await toSideRes.json();
    expect(
      toSideLinks.some(
        (link: { book: { id: string }; direction: string }) =>
          link.book.id === bookA.id && link.direction === "incoming"
      )
    ).toBe(true);

    // 後始末: DELETE経由でリンク自体も削除しておく（本の削除でもcascadeされるが、
    // このテストの検証対象であるDELETEハンドラを併せて確認する）。
    const delRes = await DELETE(deleteRequest({ id: created.id }));
    expect(delRes.status).toBe(200);
  });

  it("returns 400 when from_book_id is not a valid UUID", async () => {
    const bookB = await makeBook("不正ID確認用");
    const res = await POST(
      postRequest({ from_book_id: MALFORMED_ID, to_book_id: bookB.id })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when linking a book to itself", async () => {
    const book = await makeBook("自己参照確認用");
    const res = await POST(
      postRequest({ from_book_id: book.id, to_book_id: book.id })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 404 when either referenced book does not exist", async () => {
    const book = await makeBook("片側のみ存在確認用");
    const res = await POST(
      postRequest({ from_book_id: book.id, to_book_id: NON_EXISTENT_UUID })
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when the same pair is linked twice", async () => {
    const bookA = await makeBook("重複ペア確認用A");
    const bookB = await makeBook("重複ペア確認用B");

    const first = await POST(
      postRequest({ from_book_id: bookA.id, to_book_id: bookB.id })
    );
    expect(first.status).toBe(201);
    const created = await first.json();

    const second = await POST(
      postRequest({ from_book_id: bookA.id, to_book_id: bookB.id })
    );
    expect(second.status).toBe(400);
    const body = await second.json();
    expect(body.error).toBeTruthy();

    await DELETE(deleteRequest({ id: created.id }));
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await POST(rawPostRequest("{not-json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("リクエストボディがJSONとして解析できません");
  });
});

describe("GET /api/links", () => {
  it("returns 400 when bookId is missing", async () => {
    const res = await GET(getRequest(null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when bookId is not a valid UUID", async () => {
    const res = await GET(getRequest(MALFORMED_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 200 with an empty array when the book has no links", async () => {
    const book = await makeBook("リンク無し確認用");
    const res = await GET(getRequest(book.id));
    expect(res.status).toBe(200);
    const links = await res.json();
    expect(links).toEqual([]);
  });
});

describe("DELETE /api/links", () => {
  it("deletes a link and returns 200 with success:true, then it disappears from the list", async () => {
    const bookA = await makeBook("削除確認用A");
    const bookB = await makeBook("削除確認用B");

    const createRes = await POST(
      postRequest({ from_book_id: bookA.id, to_book_id: bookB.id })
    );
    const created = await createRes.json();

    const delRes = await DELETE(deleteRequest({ id: created.id }));
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody).toEqual({ success: true });

    const listRes = await GET(getRequest(bookA.id));
    const links = await listRes.json();
    expect(links).toEqual([]);
  });

  it("returns 200 with success:true even when the id does not exist (idempotent)", async () => {
    const res = await DELETE(deleteRequest({ id: NON_EXISTENT_UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
  });

  it("returns 400 when the id is not a valid UUID", async () => {
    const res = await DELETE(deleteRequest({ id: MALFORMED_ID }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("returns 400 when the request body is not valid JSON", async () => {
    const res = await DELETE(
      new NextRequest("http://localhost/api/links", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("リクエストボディがJSONとして解析できません");
  });
});
