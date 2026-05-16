# Hostinger beta deploy

This project can be deployed to Hostinger as a Node.js application for a team-only beta.

## Recommended Hostinger setup

- Use Hostinger Node.js hosting on a `Business` or `Cloud` plan for the simplest beta deploy.
- Use `Node.js 24.x`.
- Deploy from GitHub when possible so redeploys can pull the latest branch automatically.
- Point `DATABASE_URL` to a real PostgreSQL instance such as Neon when running the SaaS version.

Hostinger's current support docs say managed Node.js apps can be deployed from GitHub or ZIP on Business/Cloud plans, support `Next.js`, and support Node.js `18.x`, `20.x`, `22.x`, and `24.x`.

## Why this app works on managed Hostinger

- The web app itself runs as a normal Next.js Node server.
- Main application data, credentials, accounts, and invitations can now live in PostgreSQL.
- If `DATABASE_URL` is not configured, the app falls back to the local SQLite development store and inline jobs.

That makes managed Hostinger suitable for a team beta, as long as you choose a persistent location for app data.

## Required environment variables

Set these in Hostinger during deployment or in Settings and Redeploy:

```env
DATABASE_URL=postgresql://...
# Optional only for local SQLite fallback:
AUDIT_DATA_DIR=/absolute/persistent/path/for/audit-platform-data
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://your-beta-domain.example/api/integrations/google/oauth/callback
GOOGLE_ADS_DEVELOPER_TOKEN=...
AUDIT_OPERATOR_EMAILS=person1@company.com,person2@company.com
# or
AUDIT_OPERATOR_DOMAINS=company.com
AUDIT_PLATFORM_SECRET=generate-a-long-random-secret
```

Optional:

```env
PAGESPEED_API_KEY=...
```

## Important production notes

### 1. Prefer PostgreSQL in hosted SaaS mode

This app now supports `DATABASE_URL` as the primary store.

For hosted SaaS mode:

- use PostgreSQL for clients, integrations, reports, accounts, invitations, and encrypted credential payloads
- keep `AUDIT_PLATFORM_SECRET` set so session signing and encryption stay stable across deploys

Use `AUDIT_DATA_DIR` only if you intentionally want the local SQLite fallback.

### 2. Keep platform admin bootstrap restricted

Platform admin bootstrap can still be restricted through:

- `AUDIT_OPERATOR_EMAILS`
- `AUDIT_OPERATOR_DOMAINS`

Invited customer users can log in through their stored account invitations even when they are not on the bootstrap allowlist.

### 3. Google OAuth must use the public callback URL

In Google Cloud Console, add the exact production callback:

```text
https://your-beta-domain.example/api/integrations/google/oauth/callback
```

Also update `GOOGLE_OAUTH_REDIRECT_URI` in Hostinger to the same URL.

### 4. Managed Hostinger MySQL is not the same as this app's `DATABASE_URL`

Hostinger's managed plans document MySQL support for databases. In this project, `DATABASE_URL` is for the primary SaaS data store and must be PostgreSQL.

For the beta:

- use an external PostgreSQL instance such as Neon for production-like SaaS behavior
- leave `DATABASE_URL` empty only for local or temporary SQLite fallback scenarios

## Suggested Hostinger deploy values

- Framework: `Next.js`
- Node.js version: `24.x`
- Build command: `npm run build`
- Start command: `npm run start`

## Post-deploy checklist

1. Open the temporary Hostinger URL or connected beta domain.
2. Confirm `/login` loads over HTTPS.
3. Test Google login with one bootstrap admin account.
4. Invite one customer user and confirm they can access only their own account.
5. Create a sample client and verify data survives a restart/redeploy.
6. Run one audit and export JSON/PDF.
7. If Google integrations are used, complete one OAuth connection from the deployed domain.

## Sources

- [Hostinger: How to add a Node.js Web App in Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Hostinger: Node.js hosting options at Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)
- [Hostinger: How to add environment variables during Node.js application deployment](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
- [Hostinger: How to connect a custom domain to a Node.js application](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)
