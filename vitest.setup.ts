// Next.js は `.env.local` を独自ランタイムで読み込むが、Vitestはその仕組みの外で動くため、
// テスト実行前にここで手動で読み込み `process.env` に反映する。
// 外部パッケージ（dotenv等）は追加せず、Node標準の `fs` だけで最小限のパーサを実装する。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
