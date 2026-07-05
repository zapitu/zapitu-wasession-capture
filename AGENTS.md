# Agent Guidelines

## Scope

This project is a Manifest V3 browser extension that captures an authenticated WhatsApp Web session and delivers it to a companion web app. The extension is intentionally small and security-sensitive. Avoid changing the core pairing/capture behavior unless explicitly asked.

## Technical overview

Read these files before making any non-trivial change:

- `manifest.config.ts` — defines the service worker, content scripts, host permissions, and build-time env substitution.
- `src/background/index.ts` — service worker that orchestrates the tab, polling, consent flow, extraction, and POST.
- `src/content/app-bridge.ts` — injected into the companion app origin; forwards `postMessage` from the page to the service worker and back.
- `src/content/wa-web-dump.js` — injected into `web.whatsapp.com` in the `MAIN` world; reads localStorage, IndexedDB, and internal WA modules to build the session dump.
- `src/popup/App.tsx` — popup UI shown when the user clicks the extension icon.
- `src/lib/i18n.ts` — locale strings for en/pt/es. New user-visible strings must be added here.
- `docs/INTEGRATION.md` — postMessage protocol expected by the companion app. Update this when the protocol changes.

## Critical behaviors to preserve

### postMessage protocol

The companion app and the bridge communicate over `window.postMessage` with the constant source/target identifier `'wasession-capture'`.

- Inbound messages from the page to the bridge must include `target: 'wasession-capture'`.
- Outbound messages from the bridge to the page must include `source: 'wasession-capture'`.
- The bridge in `src/content/app-bridge.ts` and the fallback `bridgeInPage` function in `src/background/index.ts` must stay in sync. If you add a new command in one, add it in the other.

Supported commands:

- `PING` → replies `CONNECTOR_READY`.
- `START_PASSKEY_IMPORT` with `url` → opens WhatsApp Web and starts capture.
- `CAPTURE_EXISTING` → captures an existing logged-in session without clearing storage.
- `CLEAR_AND_CONTINUE` → wipes WhatsApp Web storage and reloads the tab for fresh pairing.
- `CANCEL_IMPORT` → removes the opened WhatsApp Web tab and clears state.

If you add or remove commands, update `docs/INTEGRATION.md` and the examples in `README.md`.

### Existing-session detection

When `web.whatsapp.com` finishes loading, the background script reads `last-wid-md` from localStorage. If a number is present, it sends `EXISTING_SESSION` with `event.data.number` and stops until the companion app replies. This is the normal flow for companion apps that want to capture an already-authenticated device. Do not bypass or short-circuit this unless requested.

### Polling and extraction

Once extraction begins:

1. `tick()` polls the `__waWebSessionDump` function every 2.5 seconds.
2. It waits for the same `meJid` across two consecutive polls (`pendingConfirmJid`) to avoid capturing a half-initialized session.
3. It then shows a 20-second overlay (`EXTRACTION_DELAY_MS`) and calls `finalizeDump`.
4. `postDump` sends the JSON to the provided URL. On success it wipes browsing data for `https://web.whatsapp.com` and closes the tab.

Do not reduce `EXTRACTION_DELAY_MS` or the two-poll confirmation without understanding the impact on incomplete dumps.

### Noise key handling

The dumper has two paths for the Noise key:

- `getNoiseInfoViaInternalModule()` uses the WAWebUserPrefsInfoStore internal module and works on logged-in sessions.
- `getNoiseInfoFallback()` derives a key from `wawc_db_enc` and is fragile.

If the noise key is missing, the dumper logs a warning and continues; the background script only treats it as a fatal error after four consecutive failures (`noiseFails >= 4`). Do not make a missing noise key unconditionally fatal.

### Storage wiping

`wipeWhatsAppData()` uses `chrome.browsingData.remove` with a broad set of storage types for the WhatsApp origin. This is required so the next pairing starts clean. If you change this, ensure `localStorage`, `indexedDB`, `cookies`, and `serviceWorkers` remain included.

## Build and development

```bash
npm install
npm run dev      # watch build into dist/
npm run build    # production build + type check
npm run package  # build + generate icons + zip
npm run package:local  # package with localhost app hosts
```

The package script reads `.env`. To customize the extension title or companion-app hosts, copy `.env.example` to `.env`.

## Conventions

- Use the existing internationalization helpers for all user-visible strings in `src/lib/i18n.ts`. Add keys to `en`, `pt`, and `es`.
- Prefer explicit types in `src/background/index.ts` over `any`.
- Keep `src/content/wa-web-dump.js` as plain JS that runs in the main world of WhatsApp Web. Do not import TypeScript helpers there.
- When adding host permissions or content-script matches, update `manifest.config.ts` and the `APP_HOSTS` documentation in `.env.example` and `README.md`.
- Update `docs/INTEGRATION.md` whenever the postMessage protocol or error-reason codes change.
- Run `npm run build` after changes to verify TypeScript and the CRXJS manifest generation.

## Security notes

- The dumped session contains cryptographic keys. It is POSTed only to the URL provided by the companion app. Do not log the dump contents.
- The bridge is injected only into origins listed in `APP_HOSTS`. Do not broaden `matches` patterns without review.
- The extraction overlay is injected into `web.whatsapp.com` to warn the user not to close the tab.
