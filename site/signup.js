// The email a download asks for. Kit (kit.com) keeps the list and sends the emails: an address goes from the download
// page straight to FM Lens's form in Kit and nowhere else. PostHog only counts that a signup happened.

import { track } from "./analytics.js";

/** The id of FM Lens's form in Kit. It can only add an address, so it is safe in a page. */
const FORM = "10172074";

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

/** Sends the form's address to Kit as Kit's own form script does, and gives what Kit answered. */
async function subscribe(form) {
  const response = await fetch(`https://app.kit.com/forms/${FORM}/subscriptions`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new FormData(form),
  });
  return response.json();
}

/** Asks for an address with the page's form. Resolves once Kit has taken one. */
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
        if (answer.status === "success") {
          remember();
          track("signup_sent", { page: form.dataset.page });
          resolve();
          return;
        }
        if (answer.status === "quarantined" && answer.url) {
          // Kit wants to check the visitor is a person: its own page asks, then finishes the signup.
          remember();
          window.location.assign(answer.url);
          return;
        }
        status.textContent = SAID.refused;
        form.querySelector("input").focus();
      } catch {
        status.textContent = SAID.failed;
      }
      button.disabled = false;
      button.textContent = label;
    });
  });
}
