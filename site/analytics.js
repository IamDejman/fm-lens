// Anonymous visit counts for this site, sent to PostHog without cookies or stored ids (cookieless mode): the pages seen
// and the downloads started. The README's Privacy section lists what the site and the app send.

/** FM Lens's PostHog project key. It can only add events, so it is safe in a page. */
const KEY = "phc_xoND6FWuBkhD46EWt7tr89NnoUQ5yQoHm2QDMrVCjU2q";

const CONFIG = {
  api_host: "https://us.i.posthog.com",
  defaults: "2026-08-30",
  cookieless_mode: "always",
  autocapture: false,
  capture_heatmaps: false,
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

/** Counts `event` with `props`, once PostHog has loaded. */
export function track(event, props = {}) {
  window.posthog?.push(["capture", event, props]);
}
