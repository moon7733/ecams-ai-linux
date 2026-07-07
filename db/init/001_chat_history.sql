-- 대화 히스토리 서버 저장용 PostgreSQL 테이블
create table if not exists chat_sessions (
  user_id text not null,
  chat_id text not null,
  title text not null default '새 대화',
  updated_at_ms bigint not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);

create table if not exists chat_messages (
  id bigserial primary key,
  user_id text not null,
  chat_id text not null,
  seq integer not null,
  role text,
  content text,
  message jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, chat_id, seq),
  foreign key (user_id, chat_id)
    references chat_sessions (user_id, chat_id)
    on delete cascade
);

create index if not exists idx_chat_sessions_user_updated
  on chat_sessions (user_id, updated_at_ms desc);

create index if not exists idx_chat_messages_chat_seq
  on chat_messages (user_id, chat_id, seq);
