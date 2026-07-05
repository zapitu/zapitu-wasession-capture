import { defineManifest } from "@crxjs/vite-plugin";

const title = process.env.EXTENSION_TITLE || "Zapitu WA Session Capture";
const shortName = title.length > 12 ? title.slice(0, 11) + "…" : title;

const rawAppHosts = process.env.APP_HOSTS || "https://your-app.example.com/*";
const appHosts = rawAppHosts
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const icons = {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png",
};

export default defineManifest({
  manifest_version: 3,
  name: title,
  short_name: shortName,
  version: process.env.npm_package_version || "0.1.0",
  description: `Captures an authenticated WhatsApp Web session and delivers it to ${title} for passkey-locked accounts.`,
  icons,
  action: { default_popup: "index.html", default_icon: icons },
  background: { service_worker: "src/background/index.ts", type: "module" },
  permissions: ["scripting", "tabs", "activeTab", "storage", "browsingData"],
  host_permissions: ["https://web.whatsapp.com/*", ...appHosts],
  content_scripts: [
    {
      matches: ["https://web.whatsapp.com/*"],
      js: ["src/content/wa-web-dump.js"],
      world: "MAIN",
      run_at: "document_idle",
    },
    {
      matches: appHosts,
      js: ["src/content/app-bridge.ts"],
      run_at: "document_start",
    },
  ],
});
