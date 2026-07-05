# Integration Guide

The extension injects a tiny bridge into the companion web app. The app and the
extension communicate through `window.postMessage`.

## Detecting the extension

From the companion app page, send a ping and wait for the ready event:

```js
const SOURCE = 'wasession-capture';

function pingExtension() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve(false);
    }, 2000);

    function onMessage(event) {
      if (event.source !== window) return;
      if (event.data?.source === SOURCE && event.data?.type === 'CONNECTOR_READY') {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(true);
      }
    }

    window.addEventListener('message', onMessage);
    window.postMessage({ target: SOURCE, type: 'PING' }, '*');
  });
}
```

## Starting a capture

When the backend reports that the account requires passkey pairing (for example
via libzapitu's `pair.passkey.request` event), call:

```js
const captureUrl = 'https://api.example.com/sessions/123/capture';
window.postMessage(
  { target: SOURCE, type: 'START_PASSKEY_IMPORT', url: captureUrl },
  '*',
);
```

The extension will open WhatsApp Web, capture the session and POST it to
`captureUrl`. If WhatsApp Web already has a logged-in session, the extension
sends `EXISTING_SESSION` and waits for the companion app to choose between
capturing the existing session (`CAPTURE_EXISTING`) or clearing it and starting
a fresh passkey pairing (`CLEAR_AND_CONTINUE`).

## Events sent by the extension

Listen on `window` for messages with `event.data.source === 'wasession-capture'`:

| Type                | Description                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `CONNECTOR_READY`   | The extension bridge is loaded.                                                 |
| `EXISTING_SESSION`  | WhatsApp Web already has a logged-in session. `event.data.number` has the number. |
| `IMPORT_SENT`       | The session dump was sent to the capture URL.                                   |
| `IMPORT_ERROR`      | Something failed. `event.data.reason` has a code.                               |

If `EXISTING_SESSION` is received, show a prompt to the user. To capture the
existing session without clearing it, send:

```js
window.postMessage({ target: SOURCE, type: 'CAPTURE_EXISTING' }, '*');
```

To wipe the existing session and start a fresh passkey pairing instead, send:

```js
window.postMessage({ target: SOURCE, type: 'CLEAR_AND_CONTINUE' }, '*');
```

To cancel an in-progress capture:

```js
window.postMessage({ target: SOURCE, type: 'CANCEL_IMPORT' }, '*');
```

## Error reasons

- `timeout` — the user did not complete the passkey flow in time.
- `noise_key_unavailable` — the noise key could not be extracted from this
  WhatsApp Web build.
- `network` — the POST to the capture URL failed.
- `HTTP <status>` — the capture URL returned a non-2xx response.
