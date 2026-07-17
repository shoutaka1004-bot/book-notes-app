-- book_links に関連度(strength)列を追加する。既存行にはデフォルト値2(普通)が自動的に適用される。
alter table book_links
  add column strength smallint not null default 2;

alter table book_links
  add constraint book_links_strength_range check (strength between 1 and 3);
