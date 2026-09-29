# Mobile Authentication

## Bearer token

User endpoints require a Supabase JWT in the `Authorization` header:

```
Authorization: Bearer <supabase_access_token>
```

Endpoints that use optional or required auth:

- `GET /api/auth/me`
- `POST /api/user/profile`
- `POST /api/scan`, `POST /api/inspire`
- `POST /api/supabase/searches`, `GET /api/supabase/searches`, `DELETE /api/supabase/searches/{id}`
- `POST /api/supabase/favorites`, `GET /api/supabase/favorites`, `DELETE /api/supabase/favorites/{id}`
- `POST /api/analytics/search-event`, `POST /api/analytics/booking-sas-event`

## Supabase config

The mobile app should fetch public Supabase keys from the backend:

```
GET /api/config
```

Response:

```json
{
  "supabase_url": "...",
  "supabase_anon_key": "...",
  "available": true
}
```

Use these values to initialize the Supabase client on the device.

## OAuth deep link (Expo)

Configure these redirect URLs in Supabase Auth → URL Configuration:

```
flightwatcher://auth/callback
```

Do **not** rely on `exp://…` redirects on a physical iPhone — Safari reports
“serveur introuvable”. The app always uses `flightwatcher://auth/callback`
(also declared as `scheme` in `mobile/app.json`).

The app opens Google via `WebBrowser.openAuthSessionAsync` (implicit flow on
native), then reads tokens from the callback URL.

## CORS

The backend reads allowed browser origins from `ALLOWED_ORIGINS` (comma-separated). Default values include Vite and Expo web dev servers:

```
http://localhost:5173,http://localhost:3000,http://localhost:8081,http://127.0.0.1:5173
```

Add your production web or Expo web URLs to `ALLOWED_ORIGINS` in `backend/.env` when deploying.
