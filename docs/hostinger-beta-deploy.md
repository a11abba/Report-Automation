# Hostinger beta deploy

This project can be deployed to Hostinger as a Node.js application for a team-only beta.

## Recommended Hostinger setup

- Use Hostinger Node.js hosting on a `Business` or `Cloud` plan for the simplest beta deploy.
- Use `Node.js 24.x`.
- Deploy from GitHub when possible so redeploys can pull the latest branch automatically.
- Keep `DATABASE_URL` empty on managed Hostinger unless you are pointing it to a real PostgreSQL instance for the optional `pg-boss` worker.

Hostinger's current support docs say managed Node.js apps can be deployed from GitHub or ZIP on Business/Cloud plans, support `Next.js`, and support Node.js `18.x`, `20.x`, `22.x`, and `24.x`.

## Why this app works on managed Hostinger

- The web app itself runs as a normal Next.js Node server.
- Main application data is stored in SQLite and the credential vault on disk.
- If `DATABASE_URL` is not configured, audit jobs run inline without the separate PostgreSQL queue worker.

That makes managed Hostinger suitable for a team beta, as long as you choose a persistent location for app data.

## Required environment variables

Set these in Hostinger during deployment or in Settings and Redeploy:

```env
AUDIT_DATA_DIR=/absolute/persistent/path/for/audit-platform-data
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://your-beta-domain.example/api/integrations/google/oauth/callback
AUDIT_OPERATOR_EMAILS=person1@company.com,person2@company.com
# or
AUDIT_OPERATOR_DOMAINS=company.com
AUDIT_PLATFORM_SECRET=generate-a-long-random-secret
```

Optional:

```env
PAGESPEED_API_KEY=...
DATABASE_URL=
```

## Important production notes

### 1. Persist the `data` directory

This app now supports `AUDIT_DATA_DIR`.

Point it to a persistent absolute directory that is not recreated on each deploy. This directory will hold:

- `app.db`
- `credential-vault.json`
- the legacy runtime secret file if needed

If you skip this and keep storage inside the deployment bundle, redeploys may replace beta data.

### 2. Keep the beta restricted to the team

Team access is enforced through Google login plus:

- `AUDIT_OPERATOR_EMAILS`
- `AUDIT_OPERATOR_DOMAINS`

Only allowed accounts will be able to enter the dashboard.

### 3. Google OAuth must use the public callback URL

In Google Cloud Console, add the exact production callback:

```text
https://your-beta-domain.example/api/integrations/google/oauth/callback
```

Also update `GOOGLE_OAUTH_REDIRECT_URI` in Hostinger to the same URL.

### 4. Managed Hostinger MySQL is not the same as this app's `DATABASE_URL`

Hostinger's managed plans document MySQL support for databases. In this project, `DATABASE_URL` is only for the optional `pg-boss` worker and must be PostgreSQL.

For the beta:

- leave `DATABASE_URL` empty on managed Hostinger, or
- use a VPS or external PostgreSQL instance if you want the separate worker process

## Suggested Hostinger deploy values

- Framework: `Next.js`
- Node.js version: `24.x`
- Build command: `npm run build`
- Start command: `npm run start`

## Post-deploy checklist

1. Open the temporary Hostinger URL or connected beta domain.
2. Confirm `/login` loads over HTTPS.
3. Test Google login with one allowed team account.
4. Confirm a non-allowed Google account is rejected.
5. Create a sample client and verify data survives a restart/redeploy.
6. Run one audit and export JSON/PDF.
7. If Google integrations are used, complete one OAuth connection from the deployed domain.

## Sources

- [Hostinger: How to add a Node.js Web App in Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Hostinger: Node.js hosting options at Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)
- [Hostinger: How to add environment variables during Node.js application deployment](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
- [Hostinger: How to connect a custom domain to a Node.js application](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)
