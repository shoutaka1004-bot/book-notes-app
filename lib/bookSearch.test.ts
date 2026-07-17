import { describe, expect, it } from "vitest";
import { searchBooksByKeyword } from "./bookSearch";

// このテストは実際のNDL Search（国立国会図書館サーチ）APIへ疎通する。
// モックには置き換えず、実在の書籍が正しく候補として返ることを主目的として確認する。
// ネットワーク越しの実呼び出しのためデフォルトタイムアウトでは不安定になりうるので、
// 実APIを呼ぶテストケースには個別に長めのタイムアウトを指定する。

describe("searchBooksByKeyword", () => {
  it("returns an empty array for an empty or whitespace-only keyword without calling the API", async () => {
    expect(await searchBooksByKeyword("")).toEqual([]);
    expect(await searchBooksByKeyword("   ")).toEqual([]);
  });

  it(
    "finds a real, well-known book by its title against the actual NDL Search API",
    async () => {
      // 村田沙耶香「コンビニ人間」（実在・文藝春秋刊）。
      // `any`パラメータでは上位に出てこないことを実測済みのため、title検索の精度確認を兼ねる。
      const results = await searchBooksByKeyword("コンビニ人間");

      expect(results.length).toBeGreaterThan(0);

      const match = results.find(
        (r) => r.title === "コンビニ人間" && r.author?.includes("村田")
      );
      expect(match).toBeDefined();
      expect(match?.publisher).toBeTruthy();
      // ISBNはハイフンを除去した数字のみの文字列になっているはず
      expect(match?.isbn).toMatch(/^\d{9,13}[\dXx]?$/);
    },
    15000
  );

  it(
    "finds books by a real author's name against the actual NDL Search API",
    async () => {
      const results = await searchBooksByKeyword("村上春樹");

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.author?.includes("村上"))).toBe(true);
    },
    15000
  );

  it(
    "does not return duplicate candidates when the same book matches both the title and creator request",
    async () => {
      // 「コンビニ人間」は書名検索でも著者名（村田沙耶香）検索でも見つかるはずの本のため、
      // マージ後に同一候補が重複して残っていないことを確認する。
      const results = await searchBooksByKeyword("コンビニ人間");

      const isbns = results.map((r) => r.isbn).filter((isbn): isbn is string => isbn !== null);
      expect(new Set(isbns).size).toBe(isbns.length);
    },
    15000
  );
});
