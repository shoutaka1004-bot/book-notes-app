import { describe, it, expect, afterEach } from "vitest";
import { createBook, deleteBook, getBookById, listBooks, updateBook } from "./books";

// テストごとに作成した本のIDを記録し、後始末で必ず削除する。
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

function trackBook(id: string) {
  createdBookIds.push(id);
}

describe("books CRUD", () => {
  it("creates a book and retrieves it by id", async () => {
    const created = await createBook({
      title: "テスト用の本 - 作成と取得",
      author: "テスト太郎",
      tags: ["テスト"],
    });
    trackBook(created.id);

    expect(created.id).toBeTruthy();
    expect(created.title).toBe("テスト用の本 - 作成と取得");
    expect(created.tags).toEqual(["テスト"]);
    // 未指定のnullable列はnullで返ってくる
    expect(created.rating).toBeNull();

    const fetched = await getBookById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("テスト用の本 - 作成と取得");
  });

  it("returns null when getting a non-existent book", async () => {
    const fetched = await getBookById("00000000-0000-0000-0000-000000000000");
    expect(fetched).toBeNull();
  });

  it("updates a book", async () => {
    const created = await createBook({ title: "更新前タイトル" });
    trackBook(created.id);

    const updated = await updateBook(created.id, {
      title: "更新後タイトル",
      rating: 5,
    });

    expect(updated.title).toBe("更新後タイトル");
    expect(updated.rating).toBe(5);

    const fetched = await getBookById(created.id);
    expect(fetched?.title).toBe("更新後タイトル");
    expect(fetched?.rating).toBe(5);
  });

  it("lists books including a newly created one", async () => {
    const created = await createBook({ title: "一覧確認用の本" });
    trackBook(created.id);

    const books = await listBooks();
    expect(books.some((book) => book.id === created.id)).toBe(true);
  });

  it("deletes a book so it can no longer be fetched", async () => {
    const created = await createBook({ title: "削除確認用の本" });

    await deleteBook(created.id);

    const fetched = await getBookById(created.id);
    expect(fetched).toBeNull();
  });

  it("rejects a rating outside the 1-5 range (books_rating_range constraint)", async () => {
    await expect(
      createBook({ title: "評価範囲外テスト", rating: 6 })
    ).rejects.toThrow();

    await expect(
      createBook({ title: "評価範囲外テスト2", rating: 0 })
    ).rejects.toThrow();
  });
});
