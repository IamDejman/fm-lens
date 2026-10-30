import { invoke } from "@tauri-apps/api/core";

/** True inside the Tauri app; false in a plain browser, where fixtures stand in for the game. */
export const inTauri = "__TAURI_INTERNALS__" in window;

/** Calls a Rust command, or its fixture stand-in when the UI runs in a plain browser. */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) {
    return invoke<T>(command, args);
  }
  const { mockInvoke } = await import("./dev/mock");
  return mockInvoke<T>(command, args);
}
