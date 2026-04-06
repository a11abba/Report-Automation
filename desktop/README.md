# Desktop Shell

This Electron shell is the first desktop runtime for the audit tool.

## Local run

1. Start the Next app:
   `cmd /c npm run dev`
2. In a second terminal start the desktop shell:
   `cmd /c npm run desktop:dev`

By default Electron opens `http://localhost:3000`.
Override with `AUDIT_DESKTOP_URL` if needed.
