// The email FM Lens asks for before it opens, once on each computer. Kit (kit.com) keeps the list and sends the
// emails: the address goes to FM Lens's relay (relay/), which adds it to FM Lens's form in Kit and keeps nothing.

import { type FormEvent, useState } from "react";
import { appText } from "./labels";
import { RELAY } from "./report";

const text = appText.email;

const SEND_TIMEOUT_MS = 15_000;

/** Set once this computer gave an address, so the app asks once. */
const GIVEN_KEY = "fmlens.email";

/** What the relay answers: `subscribed`, or why not, "invalid" for an address it or Kit turns down. */
type Answer = { subscribed?: boolean; error?: string };

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
  const response = await fetch(`${RELAY}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
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
      if (answer.subscribed) {
        remember();
        onGiven();
        return;
      }
      setProblem(answer.error === "invalid" ? text.refused : text.failed);
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
