# Mobile Authentication

## Google / Supabase callback (do not change in Google Console)

```
https://iowibrvboqcgknfznfvt.supabase.co/auth/v1/callback
```

## Why you saw `localhost:5173/`

Supabase **Site URL** is `http://localhost:5173`. If your app `redirectTo` is **not** in
**Redirect URLs**, Auth silently falls back to Site URL. The phone cannot run that
page → no deep link.

## Mobile `redirectTo` (direct deep link)

Expo Go uses:

```
exp://192.168.1.161:8083/--/auth/callback
```

Standalone:

```
flightwatcher://auth/callback
```

No Vite / no localhost hop.

### Supabase → Authentication → URL Configuration → Redirect URLs

Add **all** of these:

```
exp://192.168.1.161:8083/--/auth/callback
exp://**/--/auth/callback
flightwatcher://auth/callback
http://192.168.1.161:8000/**
http://localhost:5173/**
```

Optional: set Site URL to `http://192.168.1.161:5173` for LAN web — never rely on
`localhost` for phone OAuth.

### Flow

1. App opens Supabase authorize → Google
2. Google → `…supabase.co/auth/v1/callback`
3. Supabase → `exp://…/auth/callback#access_token=…` (implicit)
4. Expo Go opens → `createSessionFromUrl`
