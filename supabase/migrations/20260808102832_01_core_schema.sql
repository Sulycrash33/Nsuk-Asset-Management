-- NSUK Asset Management: core schema

create extension if not exists "pgcrypto";

-- Campuses
create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Generic recursive org tree
create table if not exists public.org_units (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.org_units(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  name text not null,
  unit_type text not null default 'Other',
  code text unique,
  asset_seq integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists org_units_parent_idx on public.org_units(parent_id);
create index if not exists org_units_campus_idx on public.org_units(campus_id);

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'staff' check (role in ('admin','staff')),
  campus_id uuid references public.campuses(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Staff <-> unit assignment
create table if not exists public.user_units (
  user_id uuid not null references public.profiles(id) on delete cascade,
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  primary key (user_id, org_unit_id)
);

-- Asset categories
create table if not exists public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Assets
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  qr_payload text not null,
  name text not null,
  category_id uuid references public.asset_categories(id) on delete set null,
  org_unit_id uuid not null references public.org_units(id) on delete restrict,
  location text,
  condition text not null default 'Working'
    check (condition in ('Working','Faulty','Under Repair','Missing')),
  value numeric(14,2) not null default 0,
  serial_number text,
  acquisition_date date,
  photo_url text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assets_unit_idx on public.assets(org_unit_id);
create index if not exists assets_category_idx on public.assets(category_id);
create index if not exists assets_condition_idx on public.assets(condition);
create index if not exists assets_serial_idx on public.assets(serial_number);

-- Lightweight activity trail
create table if not exists public.asset_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid,
  asset_barcode text,
  asset_name text,
  action text not null check (action in ('created','edited','moved','deleted')),
  performed_by uuid references public.profiles(id) on delete set null,
  from_unit_id uuid references public.org_units(id) on delete set null,
  to_unit_id uuid references public.org_units(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists asset_logs_asset_idx on public.asset_logs(asset_id);
create index if not exists asset_logs_created_idx on public.asset_logs(created_at desc);
