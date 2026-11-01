// The language menu at the right of the masthead: a button with the flag of the language in use, which opens a menu of
// the languages, each with its flag and its own name. The menu is drawn over the window under its button, as the
// captain menu of a squad row is (see CaptainMenu.tsx), so that the masthead's styles stay off it.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { locale, setLocale, type Locale } from "./i18n";
import { appText } from "./labels";
import { askToLeave } from "./useProfileEditing";

/** The room the menu keeps between itself and its button. */
const GAP = 4;

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

/** The languages on offer, in the order of the menu, each with its own name. */
const OPTIONS: readonly { id: Locale; name: string }[] = [
  { id: "en", name: "English" },
  { id: "tr", name: "Türkçe" },
  { id: "es", name: "Español" },
];

/** The name and hover text of the button: "Language: English". */
const BUTTON_LABEL = `${appText.languageLabel}: ${OPTIONS.find(({ id }) => id === locale)?.name ?? locale}`;

/** Where the open menu hangs: the window's coordinates of its button, from the right edge and the top. */
interface Anchor {
  right: number;
  bottom: number;
}

/**
 * The button and, once it is pressed, its menu. Choosing another language reloads the window (see `setLocale`), which
 * the app survives connected (see `current_connection`), so edits pending in an open profile are asked about first.
 * While the app is `busy` the button waits.
 */
export function LanguageSwitch({ busy }: { busy: boolean }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = anchor !== null;

  const show = () => {
    const box = button.current?.getBoundingClientRect();
    if (box) {
      setAnchor({ right: document.documentElement.clientWidth - box.right, bottom: box.bottom });
    }
  };

  const close = () => {
    setAnchor(null);
    button.current?.focus();
  };

  // Once the menu is on screen, the language in use takes focus, so that the arrow keys go on from it.
  useLayoutEffect(() => {
    if (anchor !== null) {
      menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    }
  }, [anchor]);

  // A press elsewhere closes it, and so does a resize, which moves the button but not the menu.
  useEffect(() => {
    if (!open) {
      return;
    }
    const pressed = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && (menu.current?.contains(target) || button.current?.contains(target))) {
        return;
      }
      setAnchor(null);
    };
    const resized = () => setAnchor(null);
    document.addEventListener("pointerdown", pressed, true);
    window.addEventListener("resize", resized);
    return () => {
      document.removeEventListener("pointerdown", pressed, true);
      window.removeEventListener("resize", resized);
    };
  }, [open]);

  const choose = (next: Locale) => {
    close();
    if (!busy && next !== locale) {
      askToLeave(() => setLocale(next));
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
    const at = items.findIndex((item) => item === document.activeElement);
    let next: HTMLElement | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = items[(at + 1) % items.length];
        break;
      case "ArrowUp":
        next = items[(at - 1 + items.length) % items.length];
        break;
      case "Home":
        next = items[0];
        break;
      case "End":
        next = items[items.length - 1];
        break;
      case "Escape":
        // An open profile closes on Escape too: this one is the menu's.
        event.stopPropagation();
        event.preventDefault();
        close();
        return;
      case "Tab":
        // Tab leaves the menu for the controls after its button.
        close();
        return;
      default:
        return;
    }
    event.preventDefault();
    next?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className="language-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={BUTTON_LABEL}
        title={BUTTON_LABEL}
        disabled={busy}
        onClick={() => (open ? setAnchor(null) : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            show();
          }
        }}
      >
        {FLAGS[locale]}
        <svg className="language-chevron" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 8 5 5 5-5" />
        </svg>
      </button>
      {anchor !== null &&
        createPortal(
          <div
            ref={menu}
            className="language-menu"
            role="menu"
            aria-label={appText.languageLabel}
            style={{ top: anchor.bottom + GAP, right: anchor.right }}
            onKeyDown={keyDown}
          >
            {OPTIONS.map(({ id, name }) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={id === locale}
                lang={id}
                tabIndex={-1}
                onClick={() => choose(id)}
              >
                {FLAGS[id]}
                {name}
                {id === locale && (
                  <svg className="language-check" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                  </svg>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
