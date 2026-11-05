// The app's keyboard shortcuts: Command on a Mac, Control elsewhere. ⌘1 to ⌘7 open the sections, ⌘F goes to the
// search box of the open list, ⌘S applies the edits of the profile being edited.

const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Whether `event` is Command (Control off a Mac) with `key` and no other modifier. */
export function isShortcut(event: KeyboardEvent, key: string): boolean {
  return (
    (MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing &&
    event.key.toLowerCase() === key
  );
}

/** Whether `event` is one of the app's shortcuts, which a dialog keeps from what is behind it. */
export function isAppShortcut(event: KeyboardEvent): boolean {
  return ["1", "2", "3", "4", "5", "6", "f", "s"].some((key) => isShortcut(event, key));
}

/** The shortcut as the platform writes it: "⌘1", "Ctrl+1". */
export function shortcutLabel(key: string): string {
  return MAC ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}

/** The shortcut for `aria-keyshortcuts`: "Meta+1", "Control+1". */
export function shortcutAria(key: string): string {
  return MAC ? `Meta+${key.toUpperCase()}` : `Control+${key.toUpperCase()}`;
}
