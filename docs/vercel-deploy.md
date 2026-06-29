# Vercel production deploy

The production application runs on Vercel at:

```text
https://reports.fergro.me
```

Hostinger manages only the domain DNS. Application environment variables, builds, and deployments are managed in Vercel.

## Google OAuth values

Use these exact values in the Google Cloud Console OAuth Web application:

Authorized JavaScript origin:

```text
https://reports.fergro.me
```

Authorized redirect URI:

```text
https://reports.fergro.me/api/integrations/google/oauth/callback
```

The redirect URI must include `https://`, use `reports.fergro.me`, include the complete callback path, and have no trailing slash.

## Vercel environment variables

Open **Vercel > Project > Settings > Environment Variables** and configure these server-side variables for **Production**:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://reports.fergro.me/api/integrations/google/oauth/callback
AUDIT_PLATFORM_SECRET=...
```

Do not set `AUDIT_QUEUE_MODE=worker` on Vercel. Report generation runs inside a Vercel Function
with a 300-second limit. The worker mode is reserved for hosts that run `npm run worker` as a
persistent process.

The Google client ID and secret must belong to the same OAuth Web application configured in Google Cloud Console.

After changing an environment variable, create a new production deployment. Existing deployments do not receive updated environment variables automatically.

## Hostinger domain DNS

Keep the domain registered or DNS-managed in Hostinger. In Hostinger's DNS zone, configure the records requested by **Vercel > Project > Settings > Domains** for `reports.fergro.me`.

Do not configure application secrets or `GOOGLE_OAUTH_REDIRECT_URI` in Hostinger. Hostinger only routes the domain to Vercel.

## Verification

1. Confirm Vercel shows `reports.fergro.me` as a valid production domain.
2. Open `https://reports.fergro.me/login`.
3. Start a fresh Google login.
4. Confirm the Google request uses:

```text
redirect_uri=https://reports.fergro.me/api/integrations/google/oauth/callback
```

## Sources

- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
