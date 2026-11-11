import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { inTauri, watchCommands } from "./api";
import { locale } from "./i18n";

/**
 * Anonymous usage counts, sent to PostHog: how many installs open the app, connect to FM and use each kind of edit.
 * Never a name, a value, a path or anything typed. Nothing is sent from a debug build, from the browser preview, or
 * once "Share anonymous usage" is off in Settings. The README and the site list every event.
 */

/** FM Lens's PostHog project key. It can only add events, so it is safe in the app. */
const POSTHOG_KEY: string = "phc_xoND6FWuBkhD46EWt7tr89NnoUQ5yQoHm2QDMrVCjU2q";
const CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";
const SEND_TIMEOUT_MS = 10_000;

const SWITCH_KEY = "fm-lens.usage";
/** A random id made on first use: it counts installs, and says nothing about who uses them. */
const INSTALL_KEY = "fm-lens.installId";
/** Set for the life of the window, so a reload (a new language or currency) is not counted as another launch. */
const OPENED_KEY = "fm-lens.opened";

/** The commands that change the game, counted as `edit_applied`. Reads and plans are not counted. */
export const EDITS = new Set([
  "add_injury",
  "add_release_clause",
  "add_tie",
  "apply_edits",
  "apply_mass_edit",
  "cancel_future_transfers",
  "change_clause",
  "change_injury",
  "change_language",
  "change_preference",
  "change_staff_job",
  "change_tie",
  "close_promise",
  "end_loan",
  "freeze_attributes",
  "freeze_money",
  "freeze_staff_attributes",
  "heal_player",
  "keep_playing",
  "lift_bans",
  "move_manager",
  "move_player",
  "move_staff",
  "point_preference",
  "release_player",
  "remove_clause",
  "remove_injury",
  "remove_language",
  "remove_preference",
  "remove_tie",
  "set_attributes",
  "set_captain",
  "set_work_permit",
  "sign_free_agent",
  "sign_free_agent_later",
  "start_loan",
  "swap_players",
  "team_action",
]);
const UNDOS = new Set(["undo_change", "undo_batch"]);

/** Whether usage is shared: on unless switched off in Settings. */
export function usageOn(): boolean {
  try {
    return localStorage.getItem(SWITCH_KEY) !== "off";
  } catch {
    return false;
  }
}

export function setUsageOn(on: boolean): void {
  try {
    localStorage.setItem(SWITCH_KEY, on ? "on" : "off");
  } catch {
    // Without storage nothing is sent anyway: `usageOn` reads it as off.
  }
}

interface Context {
  distinctId: string;
  props: Record<string, string>;
}

let context: Promise<Context | null> | null = null;

/** What every event carries, or null when this run sends nothing. Worked out once, on the first event. */
function ready(): Promise<Context | null> {
  context ??= load().catch(() => null);
  return context;
}

async function load(): Promise<Context | null> {
  if (!inTauri || !POSTHOG_KEY) {
    return null;
  }
  const [version, debug, system] = await Promise.all([
    getVersion(),
    invoke<boolean>("debug_build"),
    invoke<string>("system_version"),
  ]);
  const distinctId = installId();
  if (debug || !distinctId) {
    return null;
  }
  return { distinctId, props: { app_version: version, system, language: locale } };
}

function installId(): string | null {
  try {
    let id = localStorage.getItem(INSTALL_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(INSTALL_KEY, id);
    }
    return id;
  } catch {
    // An id that is not kept would count every launch as a new install.
    return null;
  }
}

/** Sends `event` with `props`. Never throws and never waits: a failed send is dropped. */
export function track(event: string, props: Record<string, unknown> = {}): void {
  if (!usageOn()) {
    return;
  }
  void ready()
    .then((ctx) => {
      if (!ctx) {
        return;
      }
      return fetch(CAPTURE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: POSTHOG_KEY,
          event,
          distinct_id: ctx.distinctId,
          timestamp: new Date().toISOString(),
          properties: {
            ...ctx.props,
            ...props,
            $set: ctx.props,
            $set_once: { first_version: ctx.props.app_version },
          },
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    })
    .catch(() => {});
}

/** Counts a launch of the app, once per window. */
export function trackOpened(): void {
  try {
    if (sessionStorage.getItem(OPENED_KEY)) {
      return;
    }
    sessionStorage.setItem(OPENED_KEY, "1");
  } catch {
    return;
  }
  track("app_opened");
}

/** Which kind of edit: the field keys of an edit ("contract.wage"), never their values. */
function detail(command: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (command) {
    case "apply_edits": {
      const edits: unknown[] = Array.isArray(args.edits) ? args.edits : [];
      const fields = edits.flatMap((edit) =>
        typeof edit === "object" && edit !== null && "field" in edit ? [String(edit.field)] : [],
      );
      return { entity: args.entity, fields, field_count: fields.length };
    }
    case "team_action":
      return { action: args.action };
    default:
      return {};
  }
}

watchCommands((command, args = {}) => {
  if (UNDOS.has(command)) {
    track("change_undone", { command });
  } else if (command === "export_players") {
    track("players_exported");
  } else if (EDITS.has(command)) {
    track("edit_applied", { command, ...detail(command, args) });
  }
});
