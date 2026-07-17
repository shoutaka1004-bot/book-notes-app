import { describe, it, expect } from "vitest";
import { bookFormSchema, type RawBookFormValues } from "./validation";

/** 全項目を妥当な値で埋めた基準入力。個別テストではここから必要な項目だけ上書きする。 */
function baseValues(overrides: Partial<RawBookFormValues> = {}): RawBookFormValues {
  return {
    title: "コンビニ人間",
    author: "村田沙耶香",
    publisher: "文藝春秋",
    rating: "5",
    finished_date: "2026-07-01",
    one_line_summary: "普通とは何かを問い直す一冊",
    content_summary: "コンビニ店員として働く女性の視点から...",
    why_resonated: "自分にとっての普通を考え直すきっかけになった",
    how_to_apply: "自分の当たり前を疑ってみる",
    surprising_point: "主人公の淡々とした語り口",
    quote: "私は今、生まれて初めて、世界の部品になれたのだ。",
    tags: "小説,芥川賞",
    ...overrides,
  };
}

describe("bookFormSchema", () => {
  it("accepts a fully filled valid input", () => {
    const result = bookFormSchema.safeParse(baseValues());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("コンビニ人間");
      expect(result.data.rating).toBe(5);
      expect(result.data.tags).toEqual(["小説", "芥川賞"]);
      expect(result.data.finished_date).toBe("2026-07-01");
    }
  });

  it("accepts the minimal input (only required fields filled)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({
        author: "",
        publisher: "",
        finished_date: "",
        one_line_summary: "",
        content_summary: "",
        why_resonated: "",
        how_to_apply: "",
        surprising_point: "",
        quote: "",
        tags: "",
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.author).toBeUndefined();
      expect(result.data.finished_date).toBeUndefined();
      expect(result.data.tags).toEqual([]);
    }
  });

  it("rejects when rating is unselected (empty string)", () => {
    const result = bookFormSchema.safeParse(baseValues({ rating: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects when rating is below the valid range", () => {
    const result = bookFormSchema.safeParse(baseValues({ rating: "0" }));
    expect(result.success).toBe(false);
  });

  it("rejects when rating is above the valid range", () => {
    const result = bookFormSchema.safeParse(baseValues({ rating: "6" }));
    expect(result.success).toBe(false);
  });

  it("rejects when title is empty", () => {
    const result = bookFormSchema.safeParse(baseValues({ title: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects when title is whitespace only", () => {
    const result = bookFormSchema.safeParse(baseValues({ title: "   " }));
    expect(result.success).toBe(false);
  });

  it("rejects one_line_summary at 101 characters (over the limit)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ one_line_summary: "あ".repeat(101) })
    );
    expect(result.success).toBe(false);
  });

  it("accepts one_line_summary at exactly 100 characters (boundary)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ one_line_summary: "あ".repeat(100) })
    );
    expect(result.success).toBe(true);
  });

  it("rejects content_summary at 2001 characters (over the limit)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ content_summary: "あ".repeat(2001) })
    );
    expect(result.success).toBe(false);
  });

  it("accepts content_summary at exactly 2000 characters (boundary)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ content_summary: "あ".repeat(2000) })
    );
    expect(result.success).toBe(true);
  });

  it("rejects why_resonated at 1001 characters (over the limit)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ why_resonated: "あ".repeat(1001) })
    );
    expect(result.success).toBe(false);
  });

  it("accepts why_resonated at exactly 1000 characters (boundary)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ why_resonated: "あ".repeat(1000) })
    );
    expect(result.success).toBe(true);
  });

  it("rejects how_to_apply at 1001 characters (over the limit)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ how_to_apply: "あ".repeat(1001) })
    );
    expect(result.success).toBe(false);
  });

  it("rejects surprising_point at 501 characters (over the limit)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ surprising_point: "あ".repeat(501) })
    );
    expect(result.success).toBe(false);
  });

  it("accepts surprising_point at exactly 500 characters (boundary)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ surprising_point: "あ".repeat(500) })
    );
    expect(result.success).toBe(true);
  });

  it("rejects quote at 501 characters (over the limit)", () => {
    const result = bookFormSchema.safeParse(baseValues({ quote: "あ".repeat(501) }));
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 tags", () => {
    const elevenTags = Array.from({ length: 11 }, (_, i) => `タグ${i}`).join(",");
    const result = bookFormSchema.safeParse(baseValues({ tags: elevenTags }));
    expect(result.success).toBe(false);
  });

  it("accepts exactly 10 tags (boundary)", () => {
    const tenTags = Array.from({ length: 10 }, (_, i) => `タグ${i}`).join(",");
    const result = bookFormSchema.safeParse(baseValues({ tags: tenTags }));
    expect(result.success).toBe(true);
  });

  it("rejects a tag longer than 30 characters", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ tags: "あ".repeat(31) })
    );
    expect(result.success).toBe(false);
  });

  it("accepts a tag at exactly 30 characters (boundary)", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ tags: "あ".repeat(30) })
    );
    expect(result.success).toBe(true);
  });

  it("ignores empty entries produced by trailing commas in tags", () => {
    const result = bookFormSchema.safeParse(baseValues({ tags: "小説, ,芥川賞," }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(["小説", "芥川賞"]);
    }
  });

  it("rejects finished_date in an invalid format", () => {
    const result = bookFormSchema.safeParse(
      baseValues({ finished_date: "2026/07/01" })
    );
    expect(result.success).toBe(false);
  });

  it("accepts an empty finished_date (optional field)", () => {
    const result = bookFormSchema.safeParse(baseValues({ finished_date: "" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.finished_date).toBeUndefined();
    }
  });
});
