// Pictures from the user's graphics packs (club logos, faces, flags), served by the app's
// `fmgfx` protocol. In a plain browser there are none, and every picture falls back.

import { call, inTauri } from "./api";
import type { GraphicsInfo } from "./types";

/** What a picture shows: a club's logo, a person's face, a nation's flag or a competition's logo. */
export type PictureKind = "club" | "face" | "flag" | "competition";

/**
 * The address of a picture, or null when there can be none (no id, or no app to serve it). The app answers
 * 404 for a picture no pack has, so an <img> using it needs a fallback for its error event.
 */
export function pictureUrl(kind: PictureKind, id: number | null | undefined): string | null {
  if (!inTauri || id === null || id === undefined) {
    return null;
  }
  // Tauri serves custom protocols as http://<scheme>.localhost on Windows and <scheme>://localhost elsewhere.
  const windows = navigator.userAgent.includes("Windows");
  return windows ? `http://fmgfx.localhost/${kind}/${id}` : `fmgfx://localhost/${kind}/${id}`;
}

/** Where the graphics packs are and how many pictures they hold. */
export const graphicsInfo = () => call<GraphicsInfo>("graphics_info");
