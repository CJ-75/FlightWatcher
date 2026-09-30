# Mobile Authentication

## Google Console (unchanged)

```
https://iowibrvboqcgknfznfvt.supabase.co/auth/v1/callback
```

## “But flightwatcher:// already exists in Supabase”

Correct — and that is what a **dev client / production app** needs.

**Expo Go cannot receive custom schemes** (`flightwatcher://`). Official Expo docs:
OAuth must use a Development Build for custom schemes.

With Expo Go the only usable redirect is `exp://…`.

## Second trap: LAN IP

`exp://192.168.1.161:8083/--/auth/callback` is rejected by Supabase even when
listed (or matched by `exp://**`) because of LAN-IP filtering:
https://github.com/supabase/auth/issues/2039  
→ silent fallback to Site URL `localhost:5173` → no return to the app.

## What to run (Expo Go)

```bash
cd mobile
npm run start:tunnel
```

Rescan the QR code. `redirectTo` should look like `exp://…exp.direct…` or
`exp://u.expo.dev/…` (**no** `192.168…`).

Keep in Supabase Redirect URLs:

```
flightwatcher://auth/callback
flightwatcher://**
exp://**
http://localhost:5173/**
```

## Better long-term

```bash
npx expo run:ios
# or EAS development build
```

Then `flightwatcher://auth/callback` (already in Supabase) works end-to-end.
