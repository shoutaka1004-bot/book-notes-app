-- gen_random_uuid() を使うための拡張（Supabaseでは通常デフォルト有効だが、環境依存を避けるため明記）
create extension if not exists pgcrypto;

create table books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  publisher text,
  isbn text,
  cover_url text,
  rating smallint,
  one_line_summary text,
  content_summary text,
  why_resonated text,
  how_to_apply text,
  surprising_point text,
  quote text,
  tags text[] not null default '{}',
  finished_date date,
  created_at timestamptz not null default now(),
  constraint books_rating_range check (rating is null or rating between 1 and 5)
);

create table book_links (
  id uuid primary key default gen_random_uuid(),
  from_book_id uuid not null references books (id) on delete cascade,
  to_book_id uuid not null references books (id) on delete cascade,
  note text,
  constraint book_links_no_self_link check (from_book_id <> to_book_id),
  constraint book_links_unique_pair unique (from_book_id, to_book_id)
);
