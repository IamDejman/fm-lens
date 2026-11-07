// Settings: the gear at the right of the masthead, or ⌘, (Ctrl+, off a Mac), opens a window of them in four parts.
// General holds the language, each with its flag and its own name, and the currency money is shown in; Appearance the
// theme and the zoom; Privacy the switch for anonymous usage; About the app's version and the game's build. Theme, zoom
// and usage apply at once. Another language or currency reloads the window (see `setLocale` and `setCurrency`), which
// the app survives connected, and the window comes back with Settings open (see restore.ts).

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { appearance, setAppearance, setZoom, zoom, ZOOMS, type Appearance } from "./appearance";
import { CURRENCIES, currency, setCurrency } from "./currency";
import { currencyName, currencySymbolOf } from "./format";
import { locale, setLocale, type Locale } from "./i18n";
import { isShortcut, shortcutAria, shortcutLabel } from "./keys";
import { appText } from "./labels";
import { restored, useSnapshot } from "./restore";
import { useModal } from "./useModal";
import { askToLeave } from "./useProfileEditing";
import { setUsageOn, usageOn } from "./usage";

/**
 * The flag of each language, in a box of 3:2: the Union Jack for English, as FM is British (cut to 3:2 at the sides,
 * as flag sets do), and the flags of Turkey and Spain whole. Spain's is drawn without the coat of arms, as its civil
 * flag is: at this size the arms would be a smudge.
 */
const FLAGS: Record<Locale, ReactNode> = {
  en: (
    <svg className="language-flag" viewBox="7.5 0 45 30" aria-hidden="true">
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
    <svg className="language-flag" viewBox="0 0 90 60" aria-hidden="true">
      <rect width="90" height="60" fill="#e30a17" />
      <g fill="#fff">
        <path d="M42.675 38.021a15 15 0 1 1 0-16.042 12 12 0 1 0 0 16.042z" />
        <path d="M41.75 30l13.568-4.408-8.386 11.541V22.867l8.386 11.541z" />
      </g>
    </svg>
  ),
  es: (
    <svg className="language-flag" viewBox="0 0 3 2" aria-hidden="true">
      <rect width="3" height="2" fill="#aa151b" />
      <rect y="0.5" width="3" height="1" fill="#f1bf00" shapeRendering="crispEdges" />
    </svg>
  ),
};

/** The languages on offer, in the order of the switch, each with its own name. */
const LANGUAGES: readonly { id: Locale; name: string }[] = [
  { id: "en", name: "English" },
  { id: "tr", name: "Türkçe" },
  { id: "es", name: "Español" },
];

const THEMES: readonly Appearance[] = ["system", "light", "dark"];

/** The gear's hover text, with its shortcut: "Settings (⌘,)". */
const BUTTON_TITLE = `${appText.settingsLabel} (${shortcutLabel(",")})`;

/**
 * The gear and the window it opens. While the app is `busy` neither opens, and an open window keeps the language and
 * the currency, which reload, as they are. `details` is what About shows: the app's version and the game's build.
 */
export function Settings({ busy, details }: { busy: boolean; details: ReactNode }) {
  const [open, setOpen] = useState(() => restored("settings", (value) => value === true));
  // Set once another language or currency is on its way in, so that the window opens again after the reload.
  const reopen = useRef(false);
  useSnapshot("settings", () => open || reopen.current);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const openSettings = (event: KeyboardEvent) => {
      if (isShortcut(event, ",")) {
        event.preventDefault();
        if (!busy) {
          setOpen(true);
        }
      }
    };
    window.addEventListener("keydown", openSettings);
    return () => window.removeEventListener("keydown", openSettings);
  }, [busy]);

  // Focus goes back to the gear once the window is gone: while it is up, it keeps focus inside (see useModal).
  const refocus = useRef(false);
  useEffect(() => {
    if (!open && refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [open]);

  const close = () => {
    refocus.current = true;
    setOpen(false);
  };

  // With edits pending in an open profile, the profile asks first, in its own footer: the window makes way for it.
  const reload = (apply: () => void) => {
    let leaving = false;
    askToLeave(() => {
      leaving = true;
      reopen.current = true;
      apply();
    });
    if (!leaving) {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className="settings-toggle"
        data-tour="settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts={shortcutAria(",")}
        aria-label={appText.settingsLabel}
        title={BUTTON_TITLE}
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        <svg className="settings-gear" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && <SettingsDialog busy={busy} details={details} onReload={reload} onClose={close} />}
    </>
  );
}

interface DialogProps {
  busy: boolean;
  details: ReactNode;
  /** Runs `apply`, which reloads the window, once leaving the open profile is settled. */
  onReload: (apply: () => void) => void;
  onClose: () => void;
}

function SettingsDialog({ busy, details, onReload, onClose }: DialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const [theme, updateTheme] = useState(appearance);
  const [scale, updateScale] = useState(zoom);
  const [sharing, updateSharing] = useState(usageOn);

  useModal(dialog, true, onClose);

  useEffect(() => {
    dialog.current?.focus();
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialog}
        className="modal settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <header className="modal-head">
          <h2 id={id}>{appText.settingsLabel}</h2>
        </header>

        <div className="modal-body">
          <section className="settings-section" aria-labelledby={`${id}-general`}>
            <h3 id={`${id}-general`}>{appText.general}</h3>
            <div className="settings-row">
              <span id={`${id}-language`}>{appText.languageLabel}</span>
              <div className="settings-switch" role="group" aria-labelledby={`${id}-language`}>
                {LANGUAGES.map(({ id: language, name }) => (
                  <button
                    key={language}
                    type="button"
                    lang={language}
                    aria-pressed={language === locale}
                    disabled={busy}
                    onClick={() => language !== locale && onReload(() => setLocale(language))}
                  >
                    {FLAGS[language]}
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row">
              <label htmlFor={`${id}-currency`}>{appText.currencyLabel}</label>
              <select
                id={`${id}-currency`}
                className="edit-input"
                value={currency}
                disabled={busy}
                onChange={(event) => {
                  const next = CURRENCIES.find((code) => code === event.target.value);
                  if (next && next !== currency) {
                    onReload(() => setCurrency(next));
                  }
                }}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {`${currencySymbolOf(code)} ${currencyName(code)}`}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="settings-section" aria-labelledby={`${id}-appearance`}>
            <h3 id={`${id}-appearance`}>{appText.appearance}</h3>
            <div className="settings-row">
              <span id={`${id}-theme`}>{appText.theme}</span>
              <div className="settings-switch" role="group" aria-labelledby={`${id}-theme`}>
                {THEMES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={theme === value}
                    onClick={() => {
                      setAppearance(value);
                      updateTheme(value);
                    }}
                  >
                    {appText.themes[value]}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row">
              <span id={`${id}-zoom`}>{appText.zoomLabel}</span>
              <div className="settings-switch" role="group" aria-labelledby={`${id}-zoom`}>
                {ZOOMS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scale === value}
                    onClick={() => {
                      setZoom(value);
                      updateScale(value);
                    }}
                  >
                    {value}%
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settings-section" aria-labelledby={`${id}-privacy`}>
            <h3 id={`${id}-privacy`}>{appText.privacy}</h3>
            <label className="settings-usage">
              <input
                type="checkbox"
                checked={sharing}
                onChange={(event) => {
                  setUsageOn(event.target.checked);
                  updateSharing(event.target.checked);
                }}
              />
              {appText.usageLabel}
            </label>
          </section>

          <section className="settings-section settings-about" aria-labelledby={`${id}-about`}>
            <h3 id={`${id}-about`}>{appText.about}</h3>
            {details}
          </section>
        </div>

        <footer className="modal-foot">
          <button type="button" className="primary" onClick={onClose}>
            {appText.done}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
