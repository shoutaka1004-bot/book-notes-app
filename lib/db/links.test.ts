import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBook, deleteBook } from "./books";
import { createLink, deleteLink, listAllLinks, listLinksForBook } from "./links";
import type { Book } from "../../types/book";

let bookA: Book;
let bookB: Book;
const createdLinkIds: string[] = [];

beforeEach(async () => {
  bookA = await createBook({ title: "リンクテスト用の本A" });
  bookB = await createBook({ title: "リンクテスト用の本B" });
});

afterEach(async () => {
  while (createdLinkIds.length > 0) {
    const id = createdLinkIds.pop()!;
    try {
      await deleteLink(id);
    } catch {
      // 既にテスト内（cascade含む）で削除済みの場合は無視
    }
  }
  // 本の削除は on delete cascade によりリンクも道連れで消える
  await deleteBook(bookA.id).catch(() => {});
  await deleteBook(bookB.id).catch(() => {});
});

describe("book_links CRUD", () => {
  it("creates a link and finds it from both directions", async () => {
    const link = await createLink(bookA.id, bookB.id, "テストの関連メモ");
    createdLinkIds.push(link.id);

    const linksFromA = await listLinksForBook(bookA.id);
    expect(linksFromA).toHaveLength(1);
    expect(linksFromA[0].linkId).toBe(link.id);
    expect(linksFromA[0].direction).toBe("outgoing");
    expect(linksFromA[0].book.id).toBe(bookB.id);
    expect(linksFromA[0].note).toBe("テストの関連メモ");

    const linksFromB = await listLinksForBook(bookB.id);
    expect(linksFromB).toHaveLength(1);
    expect(linksFromB[0].linkId).toBe(link.id);
    expect(linksFromB[0].direction).toBe("incoming");
    expect(linksFromB[0].book.id).toBe(bookA.id);
  });

  it("deletes a link so it no longer appears for either book", async () => {
    const link = await createLink(bookA.id, bookB.id);

    await deleteLink(link.id);

    expect(await listLinksForBook(bookA.id)).toHaveLength(0);
    expect(await listLinksForBook(bookB.id)).toHaveLength(0);
  });

  it("removes the link automatically when one of the linked books is deleted (cascade)", async () => {
    const link = await createLink(bookA.id, bookB.id);
    createdLinkIds.push(link.id);

    await deleteBook(bookA.id);
    // afterEachでbookAへの再度のdeleteBookが走るが、存在しないidへの削除はエラーにならない

    const linksFromB = await listLinksForBook(bookB.id);
    expect(linksFromB).toHaveLength(0);
  });

  it("rejects a self-referencing link (book_links_no_self_link constraint)", async () => {
    await expect(createLink(bookA.id, bookA.id)).rejects.toThrow();
  });

  it("listAllLinks returns the created link as a plain BookLink (no joined book info)", async () => {
    const link = await createLink(bookA.id, bookB.id, "全件取得テスト");
    createdLinkIds.push(link.id);

    const all = await listAllLinks();
    const found = all.find((l) => l.id === link.id);
    expect(found).toBeTruthy();
    expect(found?.from_book_id).toBe(bookA.id);
    expect(found?.to_book_id).toBe(bookB.id);
    expect(found?.note).toBe("全件取得テスト");
  });
});
