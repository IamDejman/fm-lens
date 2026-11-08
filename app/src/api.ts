import { invoke } from "@tauri-apps/api/core";

/** True inside the Tauri app; false in a plain browser, where fixtures stand in for the game. */
export const inTauri = "__TAURI_INTERNALS__" in window;

type CommandWatcher = (command: string, args?: Record<string, unknown>) => void;

const watchers = new Set<CommandWatcher>();

/**
 * Hears every command that succeeded in the app: `usage.ts` counts edits with it. Returns what stops hearing them.
 */
export function watchCommands(next: CommandWatcher): () => void {
  watchers.add(next);
  return () => {
    watchers.delete(next);
  };
}

/** Calls a Rust command, or its fixture stand-in when the UI runs in a plain browser. */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const result = inTauri
    ? await invoke<T>(command, args)
    : await import("./dev/mock").then(({ mockInvoke }) => mockInvoke<T>(command, args));
  for (const watcher of watchers) {
    try {
      watcher(command, args);
    } catch {
      // Hearing a command never fails it.
    }
  }
  return result;
}
