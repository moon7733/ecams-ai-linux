-- 사용자, 고객사, 저장소 메타데이터를 PostgreSQL로 이전하기 위한 기본 테이블
create table if not exists users (
  id text primary key,
  password_hash text not null,
  name text,
  phone text,
  affiliation text,
  user_type text not null default 'azsoft',
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists companies (
  id text primary key,
  name text not null,
  address text,
  manager text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists repositories (
  id text primary key,
  name text not null,
  path text not null,
  company_id text references companies (id) on delete set null,
  type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_repo_permissions (
  user_id text not null references users (id) on delete cascade,
  repo_id text not null references repositories (id) on delete cascade,
  level text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, repo_id)
);

create table if not exists user_company_permissions (
  user_id text not null references users (id) on delete cascade,
  company_id text not null references companies (id) on delete cascade,
  level text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

create table if not exists access_requests (
  id text primary key,
  type text not null,
  user_id text,
  repo_id text,
  company_id text,
  level text,
  status text not null default 'pending',
  payload_json jsonb not null default '{}'::jsonb,
  created_at_ms bigint,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists idx_repositories_company
  on repositories (company_id);

create index if not exists idx_access_requests_user
  on access_requests (user_id);

create index if not exists idx_access_requests_status
  on access_requests (status);
