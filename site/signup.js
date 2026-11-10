// The email signup on the home and download pages. Kit (kit.com) keeps the list and sends the emails: an address goes
// from this page straight to FM Lens's form in Kit and nowhere else. PostHog only counts that a signup happened.

import { track } from "./analytics.js";

/** The id of FM Lens's form in Kit. It can only add an address, so it is safe in a page. Empty, no page offers the signup. */
const FORM = "";

const SAID = {
  sent: "Check your inbox to confirm.",
  refused: "That did not work. Check the address and try again.",
  failed: "That did not work. Check your connection and try again.",
};

/** Sends the form's address to Kit as Kit's own form script does, and gives what Kit answered. */
async function subscribe(form) {
  const response = await fetch(`https://app.kit.com/forms/${FORM}/subscriptions`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new FormData(form),
  });
  return response.json();
}

for (const form of FORM ? document.querySelectorAll("form.signup") : []) {
  const status = form.querySelector("[role=status]");
  const button = form.querySelector("button");
  form.closest("[hidden]").hidden = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Signing up…";
    status.textContent = "";
    try {
      const answer = await subscribe(form);
      if (answer.status === "success") {
        form.reset();
        status.textContent = SAID.sent;
        track("signup_sent", { page: form.dataset.page });
      } else if (answer.status === "quarantined" && answer.url) {
        // Kit wants to check the visitor is a person: its own page asks, then finishes the signup.
        window.location.assign(answer.url);
      } else {
        status.textContent = SAID.refused;
        form.querySelector("input").focus();
      }
    } catch {
      status.textContent = SAID.failed;
    }
    button.disabled = false;
    button.textContent = label;
  });
}
