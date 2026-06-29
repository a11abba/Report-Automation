# Hostinger domain DNS

The production application runs on Vercel. Hostinger manages only the DNS for the domain.

See [Vercel production deploy](./vercel-deploy.md) for application environment variables, Google OAuth settings, and deployments.

## Domain

The production application uses:

```text
https://reports.fergro.me
```

## Hostinger responsibilities

- Keep the domain registered or DNS-managed in Hostinger.
- In Hostinger's DNS zone, configure the records shown by **Vercel > Project > Settings > Domains** for `reports.fergro.me`.
- Preserve any unrelated email or verification records already used by the domain.

## Vercel responsibilities

- Build and deploy the Next.js application.
- Manage production environment variables and secrets.
- Attach and validate `reports.fergro.me` as the production domain.
- Issue and renew HTTPS certificates.

Do not configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, or other application secrets in Hostinger. Those values belong in **Vercel > Project > Settings > Environment Variables**.

## Google OAuth values

Authorized JavaScript origin:

```text
https://reports.fergro.me
```

Authorized redirect URI:

```text
https://reports.fergro.me/api/integrations/google/oauth/callback
```

## Sources

- [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Hostinger DNS records](https://www.hostinger.com/support/1583227-how-to-manage-dns-records/)
