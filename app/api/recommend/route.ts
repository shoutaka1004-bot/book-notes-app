import { NextResponse } from "next/server";
import { getBookRecommendations } from "../../../lib/recommend";

/**
 * 記録済みの本の傾向を踏まえた、おすすめ本をClaude APIで生成して返す。
 *
 * `getBookRecommendations`（`lib/recommend.ts`）が投げる`Error`には種別を判別する
 * プロパティが無く（`ANTHROPIC_API_KEY`未設定・Claude API自体の通信障害・レスポンス
 * 解析失敗のいずれも同じ`Error`として投げられる）、メッセージ文字列でのパターンマッチにも
 * 頼らない方針のため、これらは種別を問わず一律500として扱う（book-search route が
 * 上流障害を502で返しているのとは異なる。あちらは設定不備の混在が無い純粋な上流障害の
 * みだが、こちらは「未設定」「解析失敗」という恒久的な不備を含み、区別できない以上
 * 502＝一時的な上流障害というニュアンスは誤解を招くため）。
 *
 * 記録済みの本が0件の場合はエラーではない。`buildRecommendPrompt`が0件でも例外を投げず
 * 一般的な提案を促すプロンプトを組み立てるため、そのまま200の正常系フローに乗る。
 */
export async function GET() {
  try {
    const recommendations = await getBookRecommendations();
    return NextResponse.json(recommendations, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "おすすめ本の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
