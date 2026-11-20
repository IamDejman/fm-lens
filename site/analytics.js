// Anonymous visit counts for this site, sent to PostHog without cookies or stored ids (cookieless mode): the pages seen
// and the downloads started. A link's `utm_source` (such as "reddit") is kept for the tab, so a download started a page
// later still says where the visit came from. The README's Privacy section lists what the site and the app send.

/** FM Lens's PostHog project key. It can only add events, so it is safe in a page. */
const KEY = "phc_xoND6FWuBkhD46EWt7tr89NnoUQ5yQoHm2QDMrVCjU2q";

const CONFIG = {
  api_host: "https://us.i.posthog.com",
  defaults: "2026-08-30",
  cookieless_mode: "always",
  autocapture: false,
  capture_heatmaps: false,
  // Off here, whatever the project settings turn on, so the site sends only what the README lists.
  capture_performance: false,
  capture_dead_clicks: false,
  capture_exceptions: false,
  disable_session_recording: true,
  disable_surveys: true,
};

if (KEY) {
  // PostHog's own loading queue: calls made before its script arrives wait in this list.
  window.posthog = Object.assign([], { _i: [[KEY, CONFIG]], people: [] });
  const script = document.createElement("script");
  script.src = "https://us-assets.i.posthog.com/static/array.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  document.head.append(script);
}

const SOURCE_KEY = "fmlens.source";

/** Where this visit came from: the `utm_source` of the link that brought it to this tab, or "none". */
export function source() {
  try {
    const given = new URLSearchParams(location.search).get("utm_source") ?? "";
    const named = given.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
    if (named) {
      sessionStorage.setItem(SOURCE_KEY, named);
    }
    return sessionStorage.getItem(SOURCE_KEY) ?? "none";
  } catch {
    return "none";
  }
}
source();

/** Counts `event` with `props`, once PostHog has loaded. */
export function track(event, props = {}) {
  window.posthog?.push(["capture", event, props]);
}
