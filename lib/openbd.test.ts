import { describe, expect, it } from "vitest";
import { getBookInfoByIsbn } from "./openbd";

// このテストは実際のopenBD（https://openbd.jp/ ）APIへ疎通する。
// モックには置き換えず、実在の書誌情報が正しく取得できることを主目的として確認する。
// ネットワーク越しの実呼び出しのためデフォルトタイムアウトでは不安定になりうるので、
// 実APIを呼ぶテストケースには個別に長めのタイムアウトを指定する。

describe("getBookInfoByIsbn", () => {
  it("returns null for an empty or whitespace-only isbn without calling the API", async () => {
    expect(await getBookInfoByIsbn("")).toBeNull();
    expect(await getBookInfoByIsbn("   ")).toBeNull();
  });

  it(
    "fetches cover image and publishing info for a known ISBN that has a cover image",
    async () => {
      // 山田玲子・水野菜生「おにぎりレシピ101」（ポット出版）。
      // 実測でcoverフィールドに実際の画像URLが入っていることを確認済みのISBN。
      const info = await getBookInfoByIsbn("9784780802047");

      expect(info).not.toBeNull();
      expect(info?.isbn).toBe("9784780802047");
      expect(info?.title).toBe("おにぎりレシピ101");
      expect(info?.publisher).toBe("ポット出版");
      expect(info?.coverUrl).toBe("https://cover.openbd.jp/9784780802047.jpg");
      expect(info?.publishedDate).toBeTruthy();
    },
    15000
  );

  it(
    "accepts a hyphenated ISBN and normalizes it before calling the API",
    async () => {
      const info = await getBookInfoByIsbn("978-4-7808-0204-7");

      expect(info).not.toBeNull();
      expect(info?.isbn).toBe("9784780802047");
    },
    15000
  );

  it(
    "returns null coverUrl (not an empty string) for a known ISBN that has no cover image, while other fields are still populated",
    async () => {
      // 村田沙耶香「コンビニ人間」単行本（文藝春秋）。
      // 実測でcoverフィールドが空文字列であることを確認済みのISBN。
      const info = await getBookInfoByIsbn("9784163906188");

      expect(info).not.toBeNull();
      expect(info?.title).toBe("コンビニ人間");
      expect(info?.publisher).toBe("文藝春秋");
      expect(info?.coverUrl).toBeNull();
    },
    15000
  );

  it(
    "returns null for an ISBN that does not exist in openBD",
    async () => {
      // 実測でレスポンス配列の該当要素がnullになることを確認済みの、実在しないISBN。
      const info = await getBookInfoByIsbn("9780000000002");

      expect(info).toBeNull();
    },
    15000
  );
});
