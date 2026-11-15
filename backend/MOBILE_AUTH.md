# Mobile Authentication

## Google Console (do not change)

```
https://iowibrvboqcgknfznfvt.supabase.co/auth/v1/callback
```

## Production / native build (the path that works)

Expo Go cannot reliably finish Supabase Google OAuth (no custom scheme delivery;
LAN `exp://192.168…` is rejected by Supabase even when allow-listed —
https://github.com/supabase/auth/issues/2039).

**Validate Google login with a real build:**

```bash
cd mobile
npx expo run:ios
# or EAS development / production build
```

App OAuth deep link (Supabase allowlist — keep until `waypop://` is added):

```
flightwatcher://auth/callback
```

Display name is WayPop; add `waypop://auth/callback` + `waypop://**` to Supabase when ready, then switch the app.

### Supabase → Redirect URLs (keep)

```
flightwatcher://auth/callback
flightwatcher://**
https://*.trycloudflare.com/**
http://localhost:5173/**
```

Quand le tunnel cloudflared change d’URL, ajoute aussi l’URL exacte  
`https://xxxx.trycloudflare.com/**` dans Supabase → Authentication → URL Configuration.

### Flow

1. App `signInWithOAuth` → Google  
2. Google → `…supabase.co/auth/v1/callback`  
3. Supabase → `flightwatcher://auth/callback?code=…` (or hash tokens)  
4. `openAuthSessionAsync` / Linking → `createSessionFromUrl`

## Expo Go (unsupported for Google)

Best-effort only via `EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN` (Cloudflare → `/auth/mobile-callback`).
Do not block release on Expo Go OAuth.
