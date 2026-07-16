import { createClient, SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

/**
 * ブラウザ・サーバーの両方から呼び出せる、匿名キー（anon key）ベースのSupabaseクライアントを返す。
 * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を使用する。
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません。.env.local を確認してください。"
    );
  }

  browserClient = createClient(url, anonKey);
  return browserClient;
}

/**
 * サーバー専用（APIルートでのみ使用）の、サービスロールキーベースのSupabaseクライアントを返す。
 * `SUPABASE_SERVICE_ROLE_KEY` はRLS（Row Level Security）を無視する強い権限を持つため、
 * クライアント（ブラウザ）に公開してはならない。APIルート以外から呼び出さないこと。
 */
export function getSupabaseServiceClient(): SupabaseClient {
  if (serviceClient) {
    return serviceClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません。.env.local を確認してください。"
    );
  }

  serviceClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return serviceClient;
}
