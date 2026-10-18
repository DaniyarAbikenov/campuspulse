# Google authentication

CampusPulse uses Google Identity Services (GIS) for user authentication and its own short-lived
access tokens for API calls. The backend never receives a Google password and does not store the
Google ID token.

## Local setup

1. Create or select a Google Cloud project.
2. Configure the OAuth consent screen.
3. Create an OAuth client with application type **Web application**.
4. Add the local frontend origin, normally `http://localhost:5173`, to **Authorized JavaScript
   origins**. Add `http://127.0.0.1:5173` if the frontend also uses that host.
5. Copy `.env.example` to `.env` and set `CAMPUSPULSE_GOOGLE_CLIENT_ID` to the Web Client ID.
6. Generate a private random value of at least 32 bytes for `CAMPUSPULSE_JWT_SECRET`.
7. Rebuild or restart the API container so it receives the environment values.

The popup JavaScript callback flow needs no Google client secret and no redirect URI. Keep the
client secret out of the frontend if a different Google flow is added later.

Official references:

- [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Display the Sign in with Google button](https://developers.google.com/identity/gsi/web/guides/display-button)
- [Verify a Google ID token on a backend](https://developers.google.com/identity/sign-in/web/backend-auth)

## Frontend exchange

Load `https://accounts.google.com/gsi/client`, initialize it once with the configured Web Client ID,
and pass the returned `response.credential` to CampusPulse:

```javascript
google.accounts.id.initialize({
  client_id: GOOGLE_CLIENT_ID,
  callback: async ({ credential }) => {
    const response = await fetch("http://localhost:8000/api/v1/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    });
    const session = await response.json();
  },
});
```

Render the official GIS button with `google.accounts.id.renderButton`. Google does not support
starting this flow from a custom button.

## API contract

`POST /api/v1/auth/google` accepts:

```json
{"credential": "google-signed-id-token"}
```

The backend validates signature, expiry and audience through `google-auth`, requires a verified
email, and identifies the Google account by `sub`. A new profile receives the `student` role. The
response contains:

```json
{
  "access_token": "short-lived-jwt",
  "refresh_token": "opaque-rotating-token",
  "token_type": "bearer",
  "expires_in": 900
}
```

Send the access token as `Authorization: Bearer <access_token>`. Use `POST /auth/refresh` to exchange
the refresh token for a new pair. The old refresh token is invalid immediately after a successful
exchange. `POST /auth/logout` revokes the current refresh session. Existing access tokens naturally
expire after 15 minutes.

`GET /api/v1/auth/me` returns the user profile and current role codes. The academic CRUD routes are
still open until the authorization phase introduces ownership and role policies.

For local prototyping the refresh token is returned in JSON. Before production deployment, move it
to a `Secure`, `HttpOnly`, `SameSite` cookie and add the corresponding CSRF design.
