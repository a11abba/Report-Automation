create table if not exists clients (
  id text primary key,
  name text not null,
  industry text not null,
  industry_label_pt text null,
  operating_model text not null,
  primary_domain text null,
  report_language text not null default 'pt-BR',
  report_focus text not null default 'full_funnel',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists integrations (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  platform_key text not null,
  platform_type text not null,
  display_name text not null,
  credentials jsonb not null,
  settings jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists locations (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  integration_id text null references integrations(id) on delete set null,
  label text not null,
  business_profile_id text null,
  landing_page_url text null,
  metrics jsonb not null,
  findings jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists audits (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  integration_ids jsonb not null,
  scope jsonb null,
  status text not null,
  score integer null,
  grade text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz null,
  error_message text null
);

create table if not exists audit_reports (
  audit_id text primary key references audits(id) on delete cascade,
  payload jsonb not null
);
