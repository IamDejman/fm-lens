import { invoke } from "@tauri-apps/api/core";

/** True inside the Tauri app; false in a plain browser, where fixtures stand in for the game. */
export const inTauri = "__TAURI_INTERNALS__" in window;

type CommandWatcher = (command: string, args?: Record<string, unknown>) => void;

let watcher: CommandWatcher | null = null;

/** Hears every command that succeeded in the app. `usage.ts` counts edits with it. */
export function watchCommands(next: CommandWatcher): void {
  watcher = next;
}

/** Calls a Rust command, or its fixture stand-in when the UI runs in a plain browser. */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) {
    const result = await invoke<T>(command, args);
    try {
      watcher?.(command, args);
    } catch {
      // Counting never fails a command.
    }
    return result;
  }
  const { mockInvoke } = await import("./dev/mock");
  return mockInvoke<T>(command, args);
}
