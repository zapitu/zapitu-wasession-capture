# WASession Capture Extension

A browser extension (Manifest V3) that captures an authenticated WhatsApp Web
session and delivers it to a companion web app. This allows passkey-locked
WhatsApp accounts to be paired with a server-side library such as libzapitu.

- UI strings are provided in **English**, **Portuguese** and **Spanish**.
- Language is selected automatically from the browser UI language.
- The extension title is fully customizable for whitelabeling.

## Whitelabel build

Copy `.env.example` to `.env` and set your title and app hosts:

```bash
cp .env.example .env
```

```env
EXTENSION_TITLE=My Company Passkey Connector
APP_HOSTS=https://app.mycompany.com/*
```

Then run the single package command:

```bash
npm install
npm run package
```

The command produces a loadable extension package at:

```
dist/My Company Passkey Connector.zip
```

This zip contains the `dist/` folder and can be loaded directly in Chrome as an
unpacked extension, or distributed to integrators.

## Development

```bash
npm install
npm run dev
```

Open Chrome Extensions, enable Developer mode, click **Load unpacked** and
select the `dist/` folder.

## How it works

1. The companion app calls `window.postMessage({ target: 'wasession-capture', type:
   'START_PASSKEY_IMPORT', url: '<capture-endpoint>' })`.
2. The extension opens WhatsApp Web in a background tab and forces the passkey
   pairing flow.
3. Once the user completes WebAuthn in the browser, the extension extracts the
   session credentials from WhatsApp Web's local storage and IndexedDB.
4. The dump is POSTed to the provided URL and the local WhatsApp Web storage is
   wiped.
5. The companion app receives `IMPORT_SENT` or `IMPORT_ERROR` via postMessage.

## Integration

See `docs/INTEGRATION.md` for the postMessage protocol expected by the
extension bridge.
