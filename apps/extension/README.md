# Internal Extension Scaffold

This folder contains a minimal Manifest V3 scaffold for the internal operator extension.

## What it does

- Detects the current page URL and guesses the active platform
- Stores the last detected context in session storage
- Opens the dashboard so the operator can finish or trigger the audit
- Uses a side panel as the internal control surface

## How to load

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `apps/extension`

## Current status

- It is intentionally lightweight
- It does not run the audit engine locally
- It is designed to complement the Next.js dashboard and APIs
