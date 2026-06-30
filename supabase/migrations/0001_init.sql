-- StrideFit AI — initial schema (corrected per the re-plan).
--
-- Privacy-first: no raw video or frames are ever stored; only derived gait JSON.
-- Wellness-only: the dropped prescriptive columns (pronation_tendency,
-- stability_need, cushion_need, support_need) are intentionally absent. Cadence
-- is the headline metric; everything else is a hedged estimate.
--
-- Security: RLS is enabled on every user-data table with auth.uid()-keyed
-- policies. The service_role key (used only by Edge Functions / the RevenueCat
-- webhook) bypasses RLS and must NEVER ship in the app bundle.

-- ---------------------------------------------------------------------------
-- users_profile
-- ---------------------------------------------------------------------------
create table if not exists public.users_profile (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text,
  gender       text,
  birth_year   int,
  height_cm    numeric,
  weight_kg    numeric,
  activity_goal text,          -- walking | running | gym | daily_comfort | recovery
  created_at   timestamptz not null default now()
);

alter table public.users_profile enable row level security;

create policy "users_profile: read own"   on public.users_profile for select using (auth.uid() = id);
create policy "users_profile: insert own" on public.users_profile for insert with check (auth.uid() = id);
create policy "users_profile: update own" on public.users_profile for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "users_profile: delete own" on public.users_profile for delete using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- gait_reports  (the structured, privacy-safe scan result)
-- ---------------------------------------------------------------------------
create table if not exists public.gait_reports (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  scan_type             text,                 -- walking | running | daily_comfort
  -- Defensible MVP metrics:
  cadence               numeric,              -- steps per minute (headline)
  overstride_estimate   numeric,              -- relative cue (Phase 3)
  knee_flexion_range    numeric,              -- degrees, side-view estimate (Phase 3)
  -- Per-metric confidences + capture quality live as JSON for flexibility:
  metrics               jsonb,                -- { cadence: {value, confidence}, ... }
  capture_quality       jsonb,                -- { visibilityScore, gaitCyclesDetected, ok, issues }
  -- Deferred metrics kept nullable for later phases (not prescriptive):
  symmetry_score        numeric,
  knee_valgus_score     numeric,
  hip_drop_score        numeric,
  summary               text,
  recommendation_summary text,
  created_at            timestamptz not null default now()
);

create index if not exists gait_reports_user_id_created_at_idx
  on public.gait_reports (user_id, created_at desc);

alter table public.gait_reports enable row level security;

create policy "gait_reports: read own"   on public.gait_reports for select using (auth.uid() = user_id);
create policy "gait_reports: insert own" on public.gait_reports for insert with check (auth.uid() = user_id);
create policy "gait_reports: update own" on public.gait_reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "gait_reports: delete own" on public.gait_reports for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- shoes  (public catalog; hand-curated facts + provenance)
-- ---------------------------------------------------------------------------
create table if not exists public.shoes (
  id               uuid primary key default gen_random_uuid(),
  brand            text not null,
  model            text not null,
  name             text,
  category         text,            -- neutral | stability | max_cushion | walking | trail | gym | recovery
  cushion_level    text,            -- low | medium | high
  stability_level  text,            -- neutral | stability | motion_control
  support_level    text,            -- low | medium | high
  width_options    text[],
  use_case         text[],
  price_min        numeric,
  price_max        numeric,
  image_url        text,
  product_url      text,
  is_own_product   boolean not null default false,
  tags             text[],
  -- provenance / maintenance (re-plan: facts only, no scraping):
  source           text,
  source_url       text,
  last_verified_date date,
  image_license    text,            -- self_shot | affiliate_feed | retailer_hotlink
  affiliate_network text,           -- awin | rakuten | none
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.shoes enable row level security;

-- Catalog is readable by any authenticated user; writes happen via service role
-- (admin tool / CSV import), which bypasses RLS.
create policy "shoes: read for authenticated"
  on public.shoes for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- shoe_recommendations  (per-report ranked matches)
-- ---------------------------------------------------------------------------
create table if not exists public.shoe_recommendations (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.gait_reports (id) on delete cascade,
  shoe_id     uuid not null references public.shoes (id) on delete cascade,
  match_score numeric,
  reason      text,
  rank        int,
  created_at  timestamptz not null default now()
);

create index if not exists shoe_recommendations_report_id_idx
  on public.shoe_recommendations (report_id);

alter table public.shoe_recommendations enable row level security;

-- Ownership is inherited from the parent report.
create policy "shoe_recommendations: read own"
  on public.shoe_recommendations for select
  using (exists (select 1 from public.gait_reports r where r.id = report_id and r.user_id = auth.uid()));

create policy "shoe_recommendations: insert own"
  on public.shoe_recommendations for insert
  with check (exists (select 1 from public.gait_reports r where r.id = report_id and r.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- entitlements  (RevenueCat-synced; source of truth for premium gating)
-- ---------------------------------------------------------------------------
create table if not exists public.entitlements (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  plan                text not null default 'free',   -- free | premium | lifetime
  active              boolean not null default false,
  rc_entitlement_ids  text[],
  expires_at          timestamptz,
  updated_at          timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

alter table public.entitlements enable row level security;

-- Users may READ their own entitlement; only the service role (webhook) writes it.
create policy "entitlements: read own"
  on public.entitlements for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- scan_usage  (server-enforced fair-use counter)
-- ---------------------------------------------------------------------------
create table if not exists public.scan_usage (
  user_id        uuid not null references auth.users (id) on delete cascade,
  scan_date      date not null default current_date,
  scan_count     int not null default 0,
  llm_call_count int not null default 0,
  created_at     timestamptz not null default now(),
  primary key (user_id, scan_date)
);

alter table public.scan_usage enable row level security;

-- Users may READ their own usage; only the service role (Edge Function) increments it.
create policy "scan_usage: read own"
  on public.scan_usage for select using (auth.uid() = user_id);
