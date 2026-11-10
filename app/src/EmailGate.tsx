// The email FM Lens asks for before it opens, once on each computer. Kit (kit.com) keeps the list and sends the
// emails: the address goes straight to FM Lens's form in Kit and nowhere else, as on the website's download page.

import { openUrl } from "@tauri-apps/plugin-opener";
import { type FormEvent, useState } from "react";
import { inTauri } from "./api";
import { appText } from "./labels";

const text = appText.email;

/** Kit, and FM Lens's form in it: the same form the website uses. It can only add an address. */
const KIT = "https://app.kit.com/";
const SUBSCRIBE_URL = `${KIT}forms/10172074/subscriptions`;
const SEND_TIMEOUT_MS = 15_000;

/** Set once this computer gave an address, so the app asks once. */
const GIVEN_KEY = "fmlens.email";

/** What Kit answers: "success", "quarantined" with the page where it checks the visitor is a person, or "failed". */
type Answer = { status?: string; url?: string };

/** Whether this computer gave an address before. Without storage the app asks at every start. */
export function emailGiven(): boolean {
  try {
    return window.localStorage.getItem(GIVEN_KEY) === "given";
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    window.localStorage.setItem(GIVEN_KEY, "given");
  } catch {
    // Asked again at the next start.
  }
}

async function subscribe(email: string): Promise<Answer> {
  const body = new FormData();
  body.set("email_address", email);
  const response = await fetch(SUBSCRIBE_URL, {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  return (await response.json()) as Answer;
}

/** The screen in place of the app until Kit has taken an address. */
export function EmailGate({ onGiven }: { onGiven: () => void }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setProblem(null);
    try {
      const answer = await subscribe(email);
      if (answer.status === "success" || answer.status === "quarantined") {
        // Kit holds some addresses until its own page has checked the visitor: the browser opens it, the app goes on.
        if (answer.status === "quarantined" && inTauri && answer.url?.startsWith(KIT)) {
          openUrl(answer.url).catch(() => {});
        }
        remember();
        onGiven();
        return;
      }
      setProblem(text.refused);
    } catch {
      setProblem(text.failed);
    }
    setSending(false);
  };

  return (
    <section className="connect">
      <div className="card">
        <h2 id="email-title">{text.title}</h2>
        <p className="muted">{text.intro}</p>
        <form className="email-form" onSubmit={submit}>
          <input
            type="email"
            name="email_address"
            autoComplete="email"
            spellCheck={false}
            required
            autoFocus
            placeholder="you@example.com"
            aria-labelledby="email-title"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" className="primary" disabled={sending}>
            {sending ? text.sending : text.button}
          </button>
        </form>
        <p className="hint error" role="status">
          {problem}
        </p>
      </div>
    </section>
  );
}
