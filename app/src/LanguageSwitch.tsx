import type { ReactNode } from "react";
import { locale, setLocale, type Locale } from "./i18n";
import { appText } from "./labels";
import { askToLeave } from "./useProfileEditing";

/**
 * The flag on each button, in a box of 3:2: the Union Jack for English, as FM is British (cut to 3:2 at the sides, as
 * flag sets do), and the flags of Turkey and Spain whole. Spain's is drawn without the coat of arms, as its civil flag
 * is: at this size the arms would be a smudge.
 */
const FLAGS: Record<Locale, ReactNode> = {
  en: (
    <svg className="flag" viewBox="7.5 0 45 30" aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0l60 30M60 0L0 30" stroke="#fff" strokeWidth="6" />
      <path
        d="M30 15L0 0v2.236L25.528 15zm0 0l30 15v-2.236L34.472 15zm0 0L60 0h-4.472L30 12.764zm0 0L0 30h4.472L30 17.236z"
        fill="#c8102e"
      />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  ),
  tr: (
    <svg className="flag" viewBox="0 0 90 60" aria-hidden="true">
      <rect width="90" height="60" fill="#e30a17" />
      <g fill="#fff">
        <path d="M42.675 38.021a15 15 0 1 1 0-16.042 12 12 0 1 0 0 16.042z" />
        <path d="M41.75 30l13.568-4.408-8.386 11.541V22.867l8.386 11.541z" />
      </g>
    </svg>
  ),
  es: (
    <svg className="flag" viewBox="0 0 3 2" aria-hidden="true">
      <rect width="3" height="2" fill="#aa151b" />
      <rect y="0.5" width="3" height="1" fill="#f1bf00" shapeRendering="crispEdges" />
    </svg>
  ),
};

/** The languages on offer, in the order of the buttons, each with its own name for the button's name and hover text. */
const OPTIONS: readonly { id: Locale; name: string }[] = [
  { id: "en", name: "English" },
  { id: "tr", name: "Türkçe" },
  { id: "es", name: "Español" },
];

/**
 * The flags at the right of the masthead: the pressed button is the language in use. Choosing another one reloads the
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
      {OPTIONS.map(({ id, name }) => (
        <button
          key={id}
          type="button"
          lang={id}
          data-locale={id}
          aria-pressed={id === locale}
          aria-label={name}
          disabled={busy}
          title={name}
          onClick={() => choose(id)}
        >
          {FLAGS[id]}
        </button>
      ))}
    </div>
  );
}
