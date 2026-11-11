// The email a download asks for. The address goes to FM Lens's report relay (relay/index.js, POST /subscribe), which
// keeps FM Lens's email list. PostHog only counts that a signup happened.

import { track } from "./analytics.js";

/** FM Lens's report relay, as in app/src/report.ts. */
const RELAY = "https://5om2ly4fvanjhg425jlb7s26dm0etzak.lambda-url.us-east-1.on.aws";

/** Where this browser keeps that it gave an address, so the download page asks once. */
const GIVEN = "fmlens-email-given";

const SAID = {
  refused: "That did not work. Check the address and try again.",
  failed: "That did not work. Check your connection or ad blocker and try again.",
};

/** Whether this browser gave an address before. */
export function emailGiven() {
  try {
    return localStorage.getItem(GIVEN) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(GIVEN, "1");
  } catch {
    // A browser that keeps nothing is asked again next time.
  }
}

/** Sends the form's address to the relay, and gives what it answered: `subscribed`, or why not. */
async function subscribe(form) {
  const response = await fetch(`${RELAY}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: form.querySelector("input").value }),
  });
  return response.json();
}

/** Asks for an address with the page's form. Resolves once the relay has taken one. */
export function askForEmail(form) {
  const status = form.querySelector("[role=status]");
  const button = form.querySelector("button");
  const label = button.textContent;
  return new Promise((resolve) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      button.disabled = true;
      button.textContent = "Checking…";
      status.textContent = "";
      try {
        const answer = await subscribe(form);
        if (answer.subscribed) {
          remember();
          track("signup_sent", { page: form.dataset.page });
          resolve();
          return;
        }
        if (answer.error === "invalid") {
          status.textContent = SAID.refused;
          form.querySelector("input").focus();
        } else {
          status.textContent = SAID.failed;
        }
      } catch {
        status.textContent = SAID.failed;
      }
      button.disabled = false;
      button.textContent = label;
    });
  });
}
