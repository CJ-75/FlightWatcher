# Mobile Authentication

## Google / Supabase callback (do not change)

Google is registered on the **Supabase** callback (same as web):

```
https://iowibrvboqcgknfznfvt.supabase.co/auth/v1/callback
```

Never point Google Console or mobile `redirectTo` at a custom URL instead of this.
Flow:

1. App/web → Supabase authorize → Google
2. Google → `https://….supabase.co/auth/v1/callback`
3. Supabase → app `redirectTo` (web: `{origin}/auth/callback`)

## Mobile = same web redirectTo

Mobile uses the **same** final redirect as the website:

```
{WEB_ORIGIN}/auth/callback?app_redirect=flightwatcher://auth/callback
```

The web `/auth/callback` page (already working) establishes the session, then
opens `flightwatcher://…` with the tokens.

### Setup

1. Run the **Vite web app** on the LAN (or set `EXPO_PUBLIC_WEB_URL`).
2. In Supabase → Authentication → URL Configuration → Redirect URLs, keep your
   web URL and add the LAN variant if needed, e.g.:

```
http://localhost:5173/auth/callback
http://192.168.1.161:5173/auth/callback
flightwatcher://auth/callback
```

3. Mobile env (optional):

```
EXPO_PUBLIC_API_URL=http://192.168.1.161:8000
EXPO_PUBLIC_WEB_URL=http://192.168.1.161:5173
```

4. After Google login, if Safari stays on the callback page, tap **Ouvrir FlightWatcher**.
