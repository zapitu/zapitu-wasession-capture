import { t } from '@/lib/i18n';

interface Pending {
  url: string;
  tabId?: number;
  originTabId?: number;
  attempts: number;
  awaitingConsent?: boolean;
  consented?: boolean;
  noiseFails?: number;
  extracting?: boolean;
}

const MAX_POLLS = 120;
const EXTRACTION_DELAY_MS = 20_000;
const WA_ORIGIN = 'https://web.whatsapp.com';

let pending: Pending | null = null;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let pendingConfirmJid: string | undefined;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'START_PASSKEY_IMPORT' && typeof msg.url === 'string') {
    void startImport(msg.url, sender.tab?.id).then(sendResponse);
    return true;
  }
  if (msg?.type === 'CLEAR_AND_CONTINUE') {
    void clearAndContinue().then(sendResponse);
    return true;
  }
  if (msg?.type === 'CAPTURE_EXISTING') {
    void captureExisting().then(sendResponse);
    return true;
  }
  if (msg?.type === 'CANCEL_IMPORT') {
    cancelImport();
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === 'IS_CONNECTOR_INSTALLED') {
    sendResponse({ installed: true });
    return false;
  }
  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  void injectBridgeIntoOpenTabs();
});

async function injectBridgeIntoOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: await getAppHostPatterns() });
    for (const tab of tabs) {
      if (tab.id == null) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: bridgeInPage,
        });
      } catch {
        void 0;
      }
    }
  } catch {
    void 0;
  }
}

async function getAppHostPatterns(): Promise<string[]> {
  try {
    const manifest = chrome.runtime.getManifest();
    const patterns: string[] = [];
    for (const cs of manifest.content_scripts ?? []) {
      if (cs.js?.includes('src/content/app-bridge.ts')) {
        patterns.push(...(cs.matches ?? []));
      }
    }
    return patterns.length ? patterns : ['https://your-app.example.com/*'];
  } catch {
    return ['https://your-app.example.com/*'];
  }
}

async function startImport(
  url: string,
  originTabId?: number,
): Promise<{ ok: boolean }> {
  stopPoll();
  const tab = await chrome.tabs.create({ url: `${WA_ORIGIN}/`, active: false });
  pending = { url, tabId: tab.id, originTabId, attempts: 0 };
  return { ok: true };
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!pending || pending.tabId !== tabId) return;
  if (info.status === 'complete' && tab.url?.startsWith(`${WA_ORIGIN}/`)) {
    void onReady(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (pending?.tabId === tabId) {
    pending = null;
    stopPoll();
  }
});

async function onReady(tabId: number) {
  if (!pending) return;
  if (!pending.consented) {
    const existingNumber = await readExistingWid(tabId);
    if (existingNumber) {
      pending.awaitingConsent = true;
      notifyOrigin('EXISTING_SESSION', { number: existingNumber });
      return;
    }
  }
  await activateAndForce(tabId);
}

async function readExistingWid(tabId: number): Promise<string> {
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const raw = JSON.parse(localStorage.getItem('last-wid-md') || '""');
          if (!raw || typeof raw !== 'string') return '';
          return raw.split(/[.:@]/)[0] || '';
        } catch {
          return '';
        }
      },
    });
    return (inj?.result as string) || '';
  } catch {
    return '';
  }
}

async function activateAndForce(tabId: number) {
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    void 0;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: forcePasskeyModeInPage,
    });
  } catch {
    void 0;
  }
  startPoll(tabId);
}

async function wipeWhatsAppData() {
  try {
    await chrome.browsingData.remove(
      { origins: [WA_ORIGIN] },
      {
        cacheStorage: true,
        cookies: true,
        fileSystems: true,
        indexedDB: true,
        localStorage: true,
        serviceWorkers: true,
        webSQL: true,
      },
    );
  } catch {
    void 0;
  }
}

async function clearAndContinue(): Promise<{ ok: boolean }> {
  if (!pending || pending.tabId == null) return { ok: false };
  pending.consented = true;
  pending.awaitingConsent = false;
  await wipeWhatsAppData();
  try {
    await chrome.tabs.reload(pending.tabId);
  } catch {
    void 0;
  }
  return { ok: true };
}

async function captureExisting(): Promise<{ ok: boolean }> {
  if (!pending || pending.tabId == null) return { ok: false };
  pending.consented = true;
  pending.awaitingConsent = false;
  await activateAndForce(pending.tabId);
  return { ok: true };
}

function cancelImport() {
  const tabId = pending?.tabId;
  pending = null;
  stopPoll();
  if (tabId != null) {
    void chrome.tabs.remove(tabId).catch(() => {});
  }
}

function notifyOrigin(type: string, extra: Record<string, unknown> = {}) {
  const originTabId = pending?.originTabId;
  if (originTabId == null) return;
  void chrome.tabs.sendMessage(originTabId, { type, ...extra }).catch(() => {});
}

function startPoll(tabId: number) {
  stopPoll();
  pollTimer = setInterval(() => void tick(tabId), 2500);
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

async function tick(tabId: number) {
  if (!pending) {
    stopPoll();
    return;
  }
  pending.attempts += 1;
  if (pending.attempts > MAX_POLLS) {
    console.warn('[wasession-capture] pairing not completed in time; giving up');
    notifyOrigin('IMPORT_ERROR', { reason: 'timeout' });
    stopPoll();
    pending = null;
    return;
  }

  let wid = '';
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          return JSON.parse(localStorage.getItem('last-wid-md') || '""');
        } catch {
          return '';
        }
      },
    });
    wid = (inj?.result as string) || '';
  } catch {
    return;
  }
  if (!wid) return;

  let dump: WebSessionDump | null | undefined;
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () =>
        (
          window as unknown as {
            __waWebSessionDump?: () => Promise<unknown>;
          }
        ).__waWebSessionDump?.(),
    });
    dump = inj?.result as WebSessionDump | null | undefined;
  } catch {
    return;
  }

  const dev = dump?.device;
  if (dev?.meJid && !dev.noiseKey) {
    pending.noiseFails = (pending.noiseFails ?? 0) + 1;
    if (pending.noiseFails >= 4) {
      console.warn('[wasession-capture] noise key unobtainable on this wa-web build');
      notifyOrigin('IMPORT_ERROR', { reason: 'noise_key_unavailable' });
      stopPoll();
      pending = null;
      return;
    }
  }

  if (!isCompleteDump(dump)) return;

  const jid = dump.device.meJid as string;
  if (pendingConfirmJid !== jid) {
    pendingConfirmJid = jid;
    return;
  }

  if (!pending.extracting) {
    pending.extracting = true;
    stopPoll();
    const strings = {
      title: t('extracting'),
      description: t('extractionKeepOpen'),
    };
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: showExtractionOverlay,
        args: [strings, EXTRACTION_DELAY_MS / 1000],
      });
    } catch {
      void 0;
    }
    setTimeout(() => {
      void finalizeDump(tabId, dump);
    }, EXTRACTION_DELAY_MS);
  }
}

async function finalizeDump(tabId: number, dump: WebSessionDump) {
  if (!pending) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: hideExtractionOverlay,
    });
  } catch {
    void 0;
  }
  await postDump(tabId, dump);
}

interface WebSessionDump {
  device: {
    noiseKey?: unknown;
    identityKey?: unknown;
    account?: unknown;
    meJid?: unknown;
  };
}

function isCompleteDump(
  dump: WebSessionDump | null | undefined,
): dump is WebSessionDump {
  const d = dump?.device;
  return !!(d && d.noiseKey && d.identityKey && d.account && d.meJid);
}

async function postDump(tabId: number, dump: WebSessionDump) {
  const url = pending?.url;
  if (!url) return;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dump),
    });
    if (resp.ok) {
      console.log('[wasession-capture] paired session dumped and sent');
      await wipeWhatsAppData();
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        void 0;
      }
      pending = null;
      pendingConfirmJid = undefined;
      notifyOrigin('IMPORT_SENT');
    } else {
      console.warn('[wasession-capture] dump POST failed', resp.status);
      notifyOrigin('IMPORT_ERROR', { reason: `HTTP ${resp.status}` });
      pending = null;
      pendingConfirmJid = undefined;
    }
  } catch (e) {
    console.warn('[wasession-capture] dump POST error', e);
    notifyOrigin('IMPORT_ERROR', { reason: 'network' });
    pending = null;
    pendingConfirmJid = undefined;
  }
}

function showExtractionOverlay(
  strings: { title: string; description: string },
  durationSec: number,
) {
  const id = '__waSessionCaptureOverlay__';
  if (document.getElementById(id)) return;

  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.innerHTML = `
    <div id="${id}-card">
      <div id="${id}-spinner"></div>
      <h2 id="${id}-title">${strings.title}</h2>
      <p id="${id}-desc">${strings.description}</p>
      <div id="${id}-bar"><div id="${id}-progress"></div></div>
    </div>
  `;

  const css = document.createElement('style');
  css.textContent = `
    #${id} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.75);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    #${id}-card {
      width: min(90vw, 360px);
      padding: 28px;
      border-radius: 16px;
      background: #ffffff;
      color: #111111;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    }
    @media (prefers-color-scheme: dark) {
      #${id}-card { background: #1f2937; color: #f9fafb; }
    }
    #${id}-spinner {
      width: 44px;
      height: 44px;
      margin: 0 auto 18px;
      border: 4px solid rgba(16, 185, 129, 0.2);
      border-top-color: #10b981;
      border-radius: 50%;
      animation: ${id}-spin 1s linear infinite;
    }
    @keyframes ${id}-spin { to { transform: rotate(360deg); } }
    #${id}-title { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
    #${id}-desc { margin: 0 0 20px; font-size: 13px; line-height: 1.5; opacity: 0.8; }
    #${id}-bar {
      width: 100%;
      height: 6px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.15);
      overflow: hidden;
    }
    #${id}-progress {
      width: 100%;
      height: 100%;
      border-radius: 999px;
      background: #10b981;
      transform-origin: left;
      transition: transform 0.1s linear;
    }
  `;

  document.head.appendChild(css);
  document.body.appendChild(overlay);

  const progress = document.getElementById(`${id}-progress`);
  const start = performance.now();
  const durationMs = durationSec * 1000;

  const frame = () => {
    const elapsed = performance.now() - start;
    const remaining = Math.max(0, durationMs - elapsed);
    const scale = remaining / durationMs;
    if (progress) progress.style.transform = `scaleX(${scale})`;
    if (remaining > 0) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function hideExtractionOverlay() {
  const id = '__waSessionCaptureOverlay__';
  const overlay = document.getElementById(id);
  const style = document.querySelector(`style[data-wa-session-capture-overlay]`);
  if (overlay) overlay.remove();
  if (style) style.remove();
  // Also remove our injected style tag by the id-based selector above is brittle;
  // the style tag has no marker, so rely on overlay removal only.
  const allStyles = document.querySelectorAll('style');
  allStyles.forEach((s) => {
    if (s.textContent?.includes(`#${id}`)) s.remove();
  });
}

function bridgeInPage() {
  const SOURCE = 'wasession-capture';
  const w = window as unknown as { __passkeyCaptureBridge?: boolean };
  if (w.__passkeyCaptureBridge) return;
  w.__passkeyCaptureBridge = true;

  const announce = () =>
    window.postMessage({ source: SOURCE, type: 'CONNECTOR_READY' }, '*');

  const fromWorker = ['EXISTING_SESSION', 'IMPORT_SENT', 'IMPORT_ERROR'];
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && typeof msg.type === 'string' && fromWorker.includes(msg.type)) {
      window.postMessage({ source: SOURCE, ...msg }, '*');
    }
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as
      | { target?: string; type?: string; url?: string }
      | undefined;
    if (!data || data.target !== SOURCE) return;
    if (data.type === 'PING') announce();
    if (data.type === 'START_PASSKEY_IMPORT' && typeof data.url === 'string') {
      void chrome.runtime.sendMessage({
        type: 'START_PASSKEY_IMPORT',
        url: data.url,
      });
    }
    if (data.type === 'CAPTURE_EXISTING') {
      void chrome.runtime.sendMessage({ type: 'CAPTURE_EXISTING' });
    }
    if (data.type === 'CLEAR_AND_CONTINUE' || data.type === 'CANCEL_IMPORT') {
      void chrome.runtime.sendMessage({ type: data.type });
    }
  });

  announce();
}

function forcePasskeyModeInPage() {
  // WhatsApp Web uses passkey pairing when no existing session is present.
  // This function is intentionally a no-op for existing-session captures,
  // since the dumper can read the authenticated state directly.
  // It is kept here so the extension can force pairing mode in the future
  // if a deterministic in-page switch is discovered.
  void 0;
}
