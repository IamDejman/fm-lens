import { useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { call } from "./api";
import { applyMassEdit, shownValue, undoBatch } from "./editing";
import { fieldTable } from "./fieldTables";
import { describeError } from "./format";
import { fieldLabel } from "./labels";
import type { ListState } from "./ListBrowser";
import type {
  EditField,
  MassFilters,
  MassPreview,
  MassReport,
  PlayerSummary,
} from "./types";
import { useModal } from "./useModal";
import { askToLeave, EditorContext } from "./useProfileEditing";

type Group = "ability" | "attributes" | "personality" | "positions" | "traits";
interface PlayerTemplate {
  format: "fm-lens-player";
  version: 1;
  name: string;
  values: Record<string, number>;
}
const GROUPS: { id: Group; name: string }[] = [
  { id: "ability", name: "CA / PA" },
  { id: "attributes", name: "Attributes & hidden attributes" },
  { id: "personality", name: "Personality" },
  { id: "positions", name: "Positions" },
  { id: "traits", name: "Traits" },
];
const STORAGE = "fm-lens.player-templates.v1";
const MAX_JSON = 128_000;

function isTemplate(value: unknown): value is PlayerTemplate {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<PlayerTemplate>;
  return (
    entry.format === "fm-lens-player" &&
    entry.version === 1 &&
    typeof entry.name === "string" &&
    typeof entry.values === "object" &&
    entry.values !== null &&
    !Array.isArray(entry.values) &&
    Object.keys(entry.values).length > 0 &&
    Object.keys(entry.values).length <= 256 &&
    Object.values(entry.values).every(Number.isSafeInteger)
  );
}

function loadLibrary(): PlayerTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw || raw.length > MAX_JSON * 40) return [];
    const values: unknown = JSON.parse(raw);
    return Array.isArray(values) ? values.filter(isTemplate).slice(0, 40) : [];
  } catch {
    return [];
  }
}

interface Scope {
  query: string;
  filters: MassFilters;
  total: number;
}

export function PlayerTemplatesButton({
  list,
  filters,
}: {
  list: ListState;
  filters: MassFilters;
}) {
  const { editable } = useContext(EditorContext);
  const [scope, setScope] = useState<Scope | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  if (!editable) return null;
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        disabled={list.total === null}
        onClick={() =>
          askToLeave(() =>
            setScope({ query: list.query, filters, total: list.total ?? 0 }),
          )
        }
      >
        Clone & templates
      </button>
      {scope && (
        <TemplatesDialog
          scope={scope}
          onClose={() => {
            setScope(null);
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}

function TemplatesDialog({
  scope,
  onClose,
}: {
  scope: Scope;
  onClose: () => void;
}) {
  const { onEdited } = useContext(EditorContext);
  const box = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const alive = useRef(true);
  const title = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [library, setLibrary] = useState(loadLibrary);
  const [template, setTemplate] = useState<PlayerTemplate | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerSummary[]>([]);
  const [source, setSource] = useState<PlayerSummary | null>(null);
  const [groups, setGroups] = useState<Group[]>(GROUPS.map(({ id }) => id));
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<MassPreview | null>(null);
  const [report, setReport] = useState<MassReport | null>(null);
  const [fields, setFields] = useState<EditField[]>([]);
  const [targetUids, setTargetUids] = useState("");
  useModal(box, !busy, onClose);
  useEffect(() => {
    alive.current = true;
    box.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    fieldTable("player")
      .then((table) => {
        if (!cancelled) setFields(table);
      })
      .catch((e) => {
        if (!cancelled) setError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setHits([]);
        return;
      }
      call<{ rows: PlayerSummary[] }>("search_players", { query, limit: 12 })
        .then((page) => {
          if (!cancelled) setHits(page.rows);
        })
        .catch((e) => {
          if (!cancelled) setError(describeError(e));
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const invalidate = () => {
    setPreview(null);
    setReport(null);
    setNotice(null);
  };
  const run = async (task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      if (alive.current) setError(describeError(e));
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const choose = (value: PlayerTemplate) => {
    invalidate();
    setTemplate(value);
    setName(value.name);
    setJson(JSON.stringify(value, null, 2));
  };
  const save = async () => {
    if (!template) return;
    const value = { ...template, name: name.trim() };
    await call("validate_player_template", { template: value });
    if (library.some((entry) => entry.name === value.name))
      throw new Error(
        "Choose a different name; a template with this name already exists.",
      );
    if (library.length >= 40)
      throw new Error(
        "The library holds 40 templates. Remove a template before saving another.",
      );
    const next = [...library, value];
    localStorage.setItem(STORAGE, JSON.stringify(next));
    setLibrary(next);
    choose(value);
    setNotice("Template saved on this Mac.");
  };
  const importJson = async (raw: string) => {
    invalidate();
    if (raw.length > MAX_JSON)
      throw new Error("Template files must be smaller than 128 KB.");
    const value: unknown = JSON.parse(raw);
    if (!isTemplate(value)) throw new Error("Invalid FM Lens player template.");
    await call("validate_player_template", { template: value });
    choose(value);
    setNotice("Template loaded. Save it to keep it in your library.");
  };
  const plan = async () => {
    if (!template) return;
    setPreview(null);
    setReport(null);
    let selected: number[] | undefined;
    if (targetUids.trim()) {
      const entries = targetUids.trim().split(/[\s,;]+/);
      if (
        !entries.every(
          (entry) =>
            /^\d+$/.test(entry) &&
            Number(entry) > 0 &&
            Number(entry) <= 0xffffffff,
        )
      ) {
        throw new Error("Enter player UIDs separated by commas or spaces.");
      }
      selected = [...new Set(entries.map(Number))];
    }
    const next = await call<MassPreview>("plan_player_template", {
      template,
      query: scope.query,
      filters: scope.filters,
      selected,
    });
    setPreview(next);
  };
  const apply = async () => {
    if (!preview) return;
    const id = preview.id;
    setPreview(null);
    const next = await applyMassEdit(id);
    setReport(next);
    if (next.applied > 0) onEdited();
  };
  const undo = async () => {
    if (!report) return;
    const next = await undoBatch(report.batch);
    if (next.undone > 0) onEdited();
    setNotice(`Undid ${next.undone} changes.`);
    if (next.failed.length)
      throw new Error(
        next.failed.map((entry) => describeError(entry.error)).join("\n"),
      );
    setReport(null);
  };
  const byKey = new Map(fields.map((field) => [field.key, field]));

  return createPortal(
    <div className="modal-backdrop">
      <div
        className="modal template-dialog"
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
      >
        <header className="modal-head">
          <h2 id={title}>Clone & templates</h2>
        </header>
        <div className="modal-body">
          <fieldset className="template-controls" disabled={busy}>
            <div className="template-columns">
              <section className="template-source">
                <h3>Copy from a player</h3>
                <label>
                  Find player
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSource(null);
                    }}
                  />
                </label>
                {hits.length > 0 && (
                  <div
                    className="template-hits"
                    role="group"
                    aria-label="Source players"
                  >
                    {hits.map((player) => (
                      <button
                        type="button"
                        key={player.uid}
                        aria-pressed={source?.uid === player.uid}
                        onClick={() => {
                          setSource(player);
                          setName(player.name);
                        }}
                      >
                        <span>{player.name}</span>
                        <span>
                          {player.club ?? "Free agent"} · {player.uid}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="template-groups">
                  {GROUPS.map((group) => (
                    <label key={group.id}>
                      <input
                        type="checkbox"
                        checked={groups.includes(group.id)}
                        onChange={(e) =>
                          setGroups((old) =>
                            e.target.checked
                              ? [...old, group.id]
                              : old.filter((id) => id !== group.id),
                          )
                        }
                      />
                      {group.name}
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!source || !groups.length}
                  onClick={() =>
                    void run(async () => {
                      const value = await call<PlayerTemplate>(
                        "capture_player_template",
                        {
                          uid: source!.uid,
                          name: name.trim() || source!.name,
                          groups,
                        },
                      );
                      choose(value);
                    })
                  }
                >
                  Capture {source?.name ?? "player"}
                </button>
              </section>
              <section>
                <h3>Template library</h3>
                <label>
                  Saved templates
                  <select
                    value=""
                    onChange={(e) => {
                      const value = library[Number(e.target.value)];
                      if (value) choose(value);
                    }}
                  >
                    <option value="" disabled>
                      {library.length
                        ? "Choose a template"
                        : "No saved templates"}
                    </option>
                    {library.map((entry, i) => (
                      <option key={entry.name} value={i}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Template name
                  <input
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="template-actions">
                  <button
                    type="button"
                    disabled={!template || !name.trim()}
                    onClick={() => void run(save)}
                  >
                    Save template
                  </button>
                  <button
                    type="button"
                    disabled={
                      !template ||
                      !library.some((entry) => entry.name === template.name)
                    }
                    onClick={() =>
                      void run(async () => {
                        const next = library.filter(
                          (entry) => entry.name !== template?.name,
                        );
                        localStorage.setItem(STORAGE, JSON.stringify(next));
                        setLibrary(next);
                        setNotice("Removed from library.");
                      })
                    }
                  >
                    Remove from library
                  </button>
                </div>
                {template && (
                  <p role="status">
                    <strong>{template.name}</strong> ·{" "}
                    {Object.keys(template.values).length} fields
                  </p>
                )}
                <details>
                  <summary>Import / export JSON</summary>
                  <label>
                    Template JSON
                    <textarea
                      rows={6}
                      value={json}
                      maxLength={MAX_JSON}
                      onChange={(e) => setJson(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <div className="template-actions">
                    <button
                      type="button"
                      disabled={!json.trim()}
                      onClick={() => void run(() => importJson(json))}
                    >
                      Load JSON
                    </button>
                    <button
                      type="button"
                      disabled={!template}
                      onClick={() => setJson(JSON.stringify(template, null, 2))}
                    >
                      Export JSON
                    </button>
                    <label className="template-file">
                      Import file
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file)
                            void run(async () => {
                              if (file.size > MAX_JSON)
                                throw new Error(
                                  "Template files must be smaller than 128 KB.",
                                );
                              await importJson(await file.text());
                            });
                        }}
                      />
                    </label>
                  </div>
                </details>
              </section>
            </div>
            <section className="template-targets">
              <h3>
                Apply to {scope.total.toLocaleString()} matching players
                {scope.query ? ` · “${scope.query}”` : ""}
              </h3>
              <label>
                Limit to player UIDs (optional)
                <input
                  value={targetUids}
                  onChange={(e) => {
                    setTargetUids(e.target.value);
                    invalidate();
                  }}
                  placeholder="All matching players"
                />
              </label>
              <button
                type="button"
                disabled={
                  !template || scope.total === 0 || (scope.total > 10_000 && !targetUids.trim())
                }
                onClick={() => void run(plan)}
              >
                Preview changes
              </button>
            </section>
          </fieldset>
          {preview && (
            <section aria-label="Template preview">
              <p role="status">
                {preview.targets} players · {preview.changes} changes ·{" "}
                {preview.skippedCount} skipped · {preview.unchanged} unchanged
              </p>
              <div
                className="mass-table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Changes to apply"
              >
                <table className="grid mass-grid">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>UID</th>
                      <th>Field</th>
                      <th>Before → After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => {
                      const field = byKey.get(row.field);
                      const shown = (value: number) =>
                        field ? shownValue(field, value) : value;
                      return (
                        <tr key={`${row.uid}:${row.field}`}>
                          <td>{row.name}</td>
                          <td>{row.uid}</td>
                          <td>{fieldLabel("player", row.field)}</td>
                          <td>
                            {shown(row.old)} → {shown(row.new)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {preview.changes > preview.rows.length && (
                <p>Showing the first {preview.rows.length} changes.</p>
              )}
              {preview.skippedCount > 0 && (
                <details>
                  <summary>Skipped fields</summary>
                  <ul>
                    {preview.skipped.map((row, i) => (
                      <li key={i}>
                        {row.name} · {fieldLabel("player", row.field)}:{" "}
                        {row.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}
          {report && (
            <div role="status">
              <p>Applied {report.applied} changes.</p>
              {report.failed.length > 0 && (
                <ul>
                  {report.failed.slice(0, 100).map((entry, i) => (
                    <li key={i}>
                      {entry.name}: {describeError(entry.error)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          {error && (
            <div className="banner" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer className="modal-foot">
          {preview && (
            <button
              type="button"
              className="primary"
              disabled={busy || !preview.changes}
              onClick={() => void run(apply)}
            >
              Apply {preview.changes} changes
            </button>
          )}
          {report && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(undo)}
            >
              Undo batch
            </button>
          )}
          <button type="button" disabled={busy} onClick={onClose}>
            {busy ? "Working…" : "Close"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
