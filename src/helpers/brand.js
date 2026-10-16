// The one place the portal gets the Mera Software logo and the website address from.
//
// The logo is the WEBSITE's logo (merasoftware/src/lib/brand.ts mirrors this). Its files in
// public/brand + public/icons, public/favicon.ico and brand-logo.json are written by the
// website's `npm run brand` (merasoftware/scripts/brand/build.mjs) — never edit them here.
// brand-logo.json carries the logo's size, so every <img> reserves the right space, and a
// version that changes with the artwork, so browsers fetch new files instead of a cached copy.

import generated from "./brand-logo.json";

const v = `?v=${generated.version}`;
const base = process.env.PUBLIC_URL || "";

export const BRAND_LOGO = {
  /** For light backgrounds. */
  light: `${base}/brand/merasoftware-logo.svg${v}`,
  /** For navy/dark backgrounds. */
  dark: `${base}/brand/merasoftware-logo-dark.svg${v}`,
  width: generated.width,
  height: generated.height,
  alt: "Mera Software — Digital Solutions",
};

// The public website (merasoftware). Set REACT_APP_WEBSITE_URL per environment; without it,
// localhost points at the website's dev server and everything else at production.
export const WEBSITE_URL = (
  process.env.REACT_APP_WEBSITE_URL ||
  (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:3000"
    : "https://www.merasoftware.com")
).replace(/\/$/, "");
