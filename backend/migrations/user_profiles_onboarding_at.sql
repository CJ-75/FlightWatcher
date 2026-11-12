-- Manual apply in Supabase SQL editor (never npx supabase db push)
-- Optional timestamp for admin "onboarding réalisé"

alter table public.user_profiles
  add column if not exists onboarding_completed boolean default false;

alter table public.user_profiles
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.user_profiles.onboarding_completed is 'Onboarding terminé (admin inscrits)';
comment on column public.user_profiles.onboarding_completed_at is 'Date de fin onboarding';
