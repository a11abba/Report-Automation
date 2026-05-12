# Open API Audit Studio

Multi-platform audit tooling for Google, website, CRM, commerce, and lifecycle systems.

## Current status

The project now supports:

- Next.js dashboard and API routes
- Electron desktop shell
- Postgres-first SaaS persistence with local SQLite fallback
- Account, membership, and invited-user access control
- Encrypted credential storage inside the application data store
- Google OAuth flow with signed state and PKCE
- Report generation to JSON and PDF
- Report localization for `pt-BR` and `pt-PT`

The project is still in `Phase 1`, which means some integrations are structurally ready but still using demo-backed snapshot logic until their production adapters are completed.

## Launch

Double-click one of these files:

- [Launch Web App.bat](./Launch%20Web%20App.bat)
- [Launch Desktop App.bat](./Launch%20Desktop%20App.bat)

To enable PDF export, run:

- [Install PDF Runtime.bat](./Install%20PDF%20Runtime.bat)

## Documentation

- [Phase 1 Readiness](./docs/phase-1-readiness.md)
- [Phase 2 Roadmap](./docs/phase-2-roadmap.md)
- [Hostinger Beta Deploy](./docs/hostinger-beta-deploy.md)

## Environment

Copy [`.env.example`](./.env.example) to `.env.local` and fill in the required values when enabling real Google or PageSpeed connections.

Customer access is invite-based. `AUDIT_OPERATOR_EMAILS` and/or `AUDIT_OPERATOR_DOMAINS` remain available as the bootstrap allowlist for the first platform admin login.
Website target URLs are restricted to public `http` and `https` hosts.
