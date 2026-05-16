# Phase 1 Readiness

## Purpose

This document consolidates what still needs to be completed before `Phase 1` can be treated as fully operational for internal use and controlled client delivery.

`Phase 1` target:

- single-user internal tool
- manual sync only
- desktop-capable operation
- client-facing exports
- Google OAuth available
- safe enough local credential handling

## What is already in place

- Next.js dashboard and API surface
- Electron shell for desktop launch
- local SQLite persistence
- encrypted local credential vault
- Google OAuth state signing and PKCE
- report rendering to JSON and PDF
- report localization for `pt-BR` and `pt-PT`
- audit events and basic job records
- browser extension scaffold

## Phase 1 blockers

### 1. Real API adapters are not complete

Current status:

- OAuth can connect Google accounts
- several connectors still return scaffolded/demo-backed snapshot data

This is the biggest remaining functional gap. The following adapters must move from scaffold/demo to real data fetching:

- Google Search Console
- Google Business Profile
- Google Analytics 4
- Klaviyo

Optional but still useful in Phase 1:

- PageSpeed Insights with real API key
- Website crawler refinement

Exit condition:

- a connected integration must produce real source data instead of placeholder metrics

### 2. Google setup must be operational

Required:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_ADS_DEVELOPER_TOKEN` for Google Ads

Business Profile also requires:

- API activation in Google Cloud
- project approval/access as needed by Google
- test account with real profile permissions

Exit condition:

- Search Console and Business Profile connect successfully from the product and create non-demo integrations

### 3. PDF runtime must be installed on target machines

Required:

- Playwright Chromium install

Current helper:

- `Install PDF Runtime.bat`

Exit condition:

- no PDF renderer warning on launch
- PDF link exports correctly from the app

### 4. Desktop launch and sharing need one more packaging pass

Current state:

- local Electron shell works via script
- `.bat` launchers exist

Still missing for smoother sharing:

- one-command installer or packaged executable
- branded app icon
- explicit first-run setup instructions

Exit condition:

- a teammate can open the desktop version without touching `npm` manually

### 5. Credential storage should move to OS keychain before broader sharing

Current state:

- secrets are no longer stored in plain text in the main app database
- secrets are encrypted in a local vault file

Still recommended:

- replace or augment local encrypted vault with OS keychain storage
- keep local vault only as fallback

Exit condition:

- access tokens and refresh tokens are stored in Windows Credential Manager or equivalent OS-backed store

### 6. UX needs clearer configuration states

Current gaps:

- platforms may show as `live` even when project-level auth config is missing
- OAuth buttons can appear actionable before env setup is complete
- integration cards do not yet clearly separate:
  - supported by product
  - configured in environment
  - connected to client account
  - producing real data

Exit condition:

- the UI tells the operator exactly why a connection is unavailable

## Functional requirements for full Phase 1 operation

### Runtime requirements

- Node.js installed
- Playwright Chromium installed
- app launched by `.bat` or packaged desktop app

### Required local files

- `.env.local`
- `data/app.db`
- `data/credential-vault.json`
- `data/runtime-secret.txt`

### Required environment values

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_ADS_DEVELOPER_TOKEN` for Google Ads

Optional:

- `PAGESPEED_API_KEY`
- `DATABASE_URL` if Postgres mode is still needed for special cases

### Google Cloud requirements

- Search Console API enabled
- Business Profile API enabled if GBP is needed
- OAuth consent screen configured
- OAuth client configured with localhost callback

### Operator requirements

- Search Console access on the target property
- Business Profile admin or manager access on the target profile

## Recommended Phase 1 completion order

1. Finish real Search Console adapter
2. Finish real Business Profile adapter
3. Finish GA4 adapter
4. Install PDF runtime and remove warning from target machine
5. Improve UI states for `supported`, `configured`, `connected`, and `real-data`
6. Package desktop launcher beyond script-based `.bat`
7. Upgrade secret storage to OS keychain
8. Finish Klaviyo real adapter

## Minimum acceptance checklist for calling Phase 1 complete

- desktop app launches from a non-technical operator workflow
- Google Search Console connects and returns real data
- Google Business Profile connects and returns real data
- at least one report can be generated with real Google data
- PDF export works on target machine
- no report includes demo data when the user expects live data
- credentials are not stored in plain text in the main database
- the UI clearly communicates integration and export status
