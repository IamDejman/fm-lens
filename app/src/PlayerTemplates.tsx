import { useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { call } from "./api";
import { applyMassEdit, shownValue, undoBatch } from "./editing";
import { fieldTable } from "./fieldTables";
import { describeError } from "./format";
import { fieldLabel, templatesText as text } from "./labels";
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
const GROUPS: Group[] = ["ability", "attributes", "personality", "positions", "traits"];
const LIBRARY_MAX = 40;
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
    return Array.isArray(values) ? values.filter(isTemplate).slice(0, LIBRARY_MAX) : [];
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
        {text.button}
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
  const [groups, setGroups] = useState<Group[]>(GROUPS);
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
      throw new Error(text.nameTaken);
    if (library.length >= LIBRARY_MAX)
      throw new Error(text.libraryFull(LIBRARY_MAX));
    const next = [...library, value];
    localStorage.setItem(STORAGE, JSON.stringify(next));
    setLibrary(next);
    choose(value);
    setNotice(text.savedNotice);
  };
  const importJson = async (raw: string) => {
    invalidate();
    if (raw.length > MAX_JSON) throw new Error(text.tooBig);
    const value: unknown = JSON.parse(raw);
    if (!isTemplate(value)) throw new Error(text.invalid);
    await call("validate_player_template", { template: value });
    choose(value);
    setNotice(text.loadedNotice);
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
        throw new Error(text.badIds);
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
    setNotice(text.undone(next.undone));
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
          <h2 id={title}>{text.title}</h2>
        </header>
        <div className="modal-body">
          <fieldset className="template-controls" disabled={busy}>
            <div className="template-columns">
              <section className="template-source">
                <h3>{text.copyHeading}</h3>
                <label>
                  {text.findPlayer}
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
                    aria-label={text.found}
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
                          {player.club ?? text.freeAgent} · {player.uid}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="template-groups">
                  {GROUPS.map((group) => (
                    <label key={group}>
                      <input
                        type="checkbox"
                        checked={groups.includes(group)}
                        onChange={(e) =>
                          setGroups((old) =>
                            e.target.checked
                              ? [...old, group]
                              : old.filter((id) => id !== group),
                          )
                        }
                      />
                      {text.groups[group]}
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
                  {text.capture(source?.name ?? null)}
                </button>
              </section>
              <section>
                <h3>{text.libraryHeading}</h3>
                <label>
                  {text.library}
                  <select
                    value=""
                    onChange={(e) => {
                      const value = library[Number(e.target.value)];
                      if (value) choose(value);
                    }}
                  >
                    <option value="" disabled>
                      {library.length ? text.choose : text.noneSaved}
                    </option>
                    {library.map((entry, i) => (
                      <option key={entry.name} value={i}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {text.name}
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
                    {text.save}
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
                        setNotice(text.removedNotice);
                      })
                    }
                  >
                    {text.remove}
                  </button>
                </div>
                <p className="live-region" role="status">
                  {template && (
                    <>
                      <strong>{template.name}</strong> · {text.fieldCount(Object.keys(template.values).length)}
                    </>
                  )}
                </p>
                <details>
                  <summary>{text.jsonHeading}</summary>
                  <label>
                    {text.json}
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
                      {text.loadJson}
                    </button>
                    <button
                      type="button"
                      disabled={!template}
                      onClick={() => setJson(JSON.stringify(template, null, 2))}
                    >
                      {text.showJson}
                    </button>
                    <label className="template-file">
                      {text.importFile}
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file)
                            void run(async () => {
                              if (file.size > MAX_JSON)
                                throw new Error(text.tooBig);
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
                {text.applyHeading(scope.total, scope.query)}
              </h3>
              <label>
                {text.limit}
                <input
                  value={targetUids}
                  onChange={(e) => {
                    setTargetUids(e.target.value);
                    invalidate();
                  }}
                  placeholder={text.limitPlaceholder}
                />
              </label>
              <button
                type="button"
                disabled={
                  !template || scope.total === 0 || (scope.total > 10_000 && !targetUids.trim())
                }
                onClick={() => void run(plan)}
              >
                {text.preview}
              </button>
            </section>
          </fieldset>
          {/* A live region that is always there, so that it is read out when the preview fills it. */}
          <p className="mass-summary" role="status">
            {preview && text.summary(preview.targets, preview.changes, preview.skippedCount, preview.unchanged)}
          </p>
          {preview && (
            <section aria-label={text.previewLabel}>
              <div
                className="mass-table-wrap"
                tabIndex={0}
                role="region"
                aria-label={text.tableLabel}
              >
                <table className="grid mass-grid">
                  <thead>
                    <tr>
                      <th>{text.columns.player}</th>
                      <th>{text.columns.uid}</th>
                      <th>{text.columns.field}</th>
                      <th>{text.columns.change}</th>
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
                <p>{text.firstRows(preview.rows.length)}</p>
              )}
              {preview.skippedCount > 0 && (
                <details>
                  <summary>{text.skipped}</summary>
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
          <div className="live-region" role="status">
            {report && (
              <>
                <p>{text.applied(report.applied)}</p>
                {report.failed.length > 0 && (
                  <ul>
                    {report.failed.slice(0, 100).map((entry, i) => (
                      <li key={i}>
                        {entry.name}: {describeError(entry.error)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <p className="live-region" role="status">
            {notice}
          </p>
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
              {text.apply(preview.changes)}
            </button>
          )}
          {report && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(undo)}
            >
              {text.undo}
            </button>
          )}
          <button type="button" disabled={busy} onClick={onClose}>
            {busy ? text.working : text.close}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
