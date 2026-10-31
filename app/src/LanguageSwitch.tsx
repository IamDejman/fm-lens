import { locale, setLocale, type Locale } from "./i18n";
import { appText } from "./labels";
import { askToLeave } from "./useProfileEditing";

/** The languages on offer: the short code on the button, and the language's own name for its hover text. */
const OPTIONS: readonly { id: Locale; code: string; name: string }[] = [
  { id: "en", code: "EN", name: "English" },
  { id: "tr", code: "TR", name: "Türkçe" },
];

/**
 * "EN | TR" at the foot of the sidebar: the pressed button is the language in use. Choosing the other one reloads the
 * window (see `setLocale`), which the app survives connected (see `current_connection`), so edits pending in an open
 * profile are asked about first. While the app is `busy` the buttons wait.
 */
export function LanguageSwitch({ busy }: { busy: boolean }) {
  const choose = (next: Locale) => {
    if (!busy && next !== locale) {
      askToLeave(() => setLocale(next));
    }
  };

  return (
    <div className="language-switch" role="group" aria-label={appText.languageLabel}>
      {OPTIONS.map(({ id, code, name }) => (
        <button
          key={id}
          type="button"
          lang={id}
          data-locale={id}
          aria-pressed={id === locale}
          disabled={busy}
          title={name}
          onClick={() => choose(id)}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
