import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { changesText as pagingText, listFeedbackText as feedback } from "./labels";
import { call } from "./api";
import { layoutPixels, watchZoom } from "./appearance";
import { describeError } from "./format";
import { isShortcut, shortcutAria } from "./keys";
import { isRecord, restored, useSnapshot } from "./restore";
import { askToLeave } from "./useProfileEditing";

/** Rows shown at once; the best come first. */
const ROW_LIMIT = 200;

/** Saved search, page and selection; older or invalid snapshots fall back to the first page. */
function readList(value: unknown): { query: string; selected: number | null; offset: number; argsKey: string | null } {
  const given = isRecord(value) ? value : {};
  return {
    query: typeof given.query === "string" ? given.query : "",
    offset: Number.isSafeInteger(given.offset) && Number(given.offset) >= 0 && Number(given.offset) % ROW_LIMIT === 0 ? Number(given.offset) : 0,
    argsKey: typeof given.argsKey === "string" ? given.argsKey : null,
    selected: typeof given.selected === "number" && Number.isInteger(given.selected) ? given.selected : null,
  };
}

interface Page<Row> {
  total: number;
  rows: Row[];
}

/** A row to show from elsewhere in the app: the list searches for `query` and opens the row with this UID. */
export interface Reveal {
  uid: number;
  query: string;
}

/** What a list tells the actions in its toolbar about itself. */
export interface ListState {
  /** The text in the search box. */
  query: string;
  /**
   * How many rows the search and the filters select: the total of the rows on show. Null until the list has them,
   * and while it is asking again after the search or the filters changed.
   */
  total: number | null;
  /** How many of them the list has rows for: the best ones (see `summary`). */
  shown: number;
}

interface ListBrowserProps<Row extends { uid: number }> {
  /**
   * What the list is called in the snapshot of the window that is kept when the language is switched (see
   * `restore.ts`), which gives it back its search text and its selected row: no other list has the same name.
   */
  name: string;
  /**
   * The Rust command that searches, e.g. "search_players". It takes `{ query, limit, offset, ...requestArgs }` and
   * returns a page.
   */
  command: string;
  /**
   * Arguments for the command besides `query`, `limit` and `offset`, e.g. `{ filter, order }`. They are compared by
   * value, so the list is asked again when they change however often the object is built anew.
   */
  requestArgs?: Record<string, unknown>;
  /** Changes when the game data is read again, so the list and the open profile are too. */
  version: number;
  /**
   * Every list stays mounted while another one is shown, so it keeps its query, rows and selection.
   * Only the active one is visible, takes focus when it becomes active, and shows its profile.
   */
  active: boolean;
  placeholder: string;
  /** The line beside the search box. */
  summary: (total: number, shown: number) => string;
  /** The message under an empty table. */
  empty: (query: string) => string;
  /** The filters of the list, between the search box and the table. */
  filterBar?: ReactNode;
  /** Buttons at the end of the toolbar, e.g. Mass edit; they get the search text and the total. */
  toolbarActions?: (list: ListState) => ReactNode;
  /** Under the table, e.g. the tray of the players picked for a comparison; it takes no room while it is empty. */
  footer?: ReactNode;
  /** An extra class of the table, for column rules of that list. */
  tableClass?: string;
  /** The header cells. */
  header: ReactNode;
  /** The cells of one row. */
  cells: (row: Row) => ReactNode;
  /** The profile panel of the selected row, beside the table. */
  profile?: (row: Row, panel: { version: number; onClose: () => void }) => ReactNode;
  /**
   * In place of a profile, what a row holds besides its cells, in a row of its own under it: the table keeps its whole
   * width, and picking the row again folds it away. Without either, picking a row does nothing.
   */
  detail?: (row: Row) => ReactNode;
  /** A row to open, asked for elsewhere in the app; each new object is a new request. */
  reveal?: Reveal | null;
}

/** A searchable table with the profile of the selected row beside it, or its detail under it. */
export function ListBrowser<Row extends { uid: number }>(props: ListBrowserProps<Row>) {
  const { command, requestArgs, version, active, placeholder, summary, empty, filterBar, toolbarActions } = props;
  const { name, footer, tableClass, header, cells, profile, detail, reveal } = props;
  // What the list held before the language was switched, if it was: the search text, and the UID of the row to select
  // as soon as the rows are there again.
  const [start] = useState(() => restored(name, readList));
  const [query, setQuery] = useState(start.query);
  const argsKey = JSON.stringify(requestArgs ?? {});
  const [position, setPosition] = useState(() => ({ key: JSON.stringify([start.query, start.argsKey ?? argsKey]), offset: start.offset }));
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const wanted = useRef(start.selected);
  const [page, setPage] = useState<Page<Row> | null>(null);
  // The search text and arguments the rows on show were asked for: their total is the list's only while those are
  // the ones in the search box and the filters now.
  const [shownFor, setShownFor] = useState<{ query: string; argsKey: string; offset: number; requestKey: string } | null>(null);
  const [failure, setFailure] = useState<{ requestKey: string; message: string } | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const tableWrap = useRef<HTMLDivElement>(null);
  const selectedRow = useRef<HTMLTableRowElement>(null);
  const headRow = useRef<HTMLTableRowElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const box = tableWrap.current;
    if (!box) return;
    // WebKit container queries can retain the unscaled width under root CSS zoom.
    const measure = () => setAvailableWidth(Math.floor(layoutPixels(box.getBoundingClientRect().width)));
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(box);
    const unwatch = watchZoom(measure);
    return () => { observer?.disconnect(); unwatch(); };
  }, []);
  const listWidth = availableWidth === null ? undefined
    : availableWidth > 1200 ? "wide" : availableWidth > 960 ? "medium"
    : availableWidth > 880 ? "compact" : availableWidth > 560 ? "narrow" : "small";


  // The arguments as JSON, which is how they reach the command: the effect below depends on their value.
  const pageKey = JSON.stringify([query, argsKey]);
  const offset = position.key === pageKey ? position.offset : 0;
  const requestKey = JSON.stringify([command, pageKey, offset, version, attempt]);
  const error = failure?.requestKey === requestKey ? failure.message : null;
  useSnapshot(name, () => ({ query, selected: selected?.uid ?? null, offset, argsKey }));
  useEffect(() => setPosition((current) => current.key === pageKey ? current : { key: pageKey, offset: 0 }), [pageKey]);
  const goToPage = (next: number) => {
    setPosition({ key: pageKey, offset: next });
    setAttempt((value) => value + 1);
  };
  // The arguments of the rows on show, so a new sort or filter can start at the top.
  const shownArgs = useRef(argsKey);

  const closeProfile = useCallback(() => {
    // The panel unmounts with the focused control inside it; keep keyboard focus in the table. In a narrow window the
    // profile hides the list, so the row can take focus only once the profile is gone.
    const row = document.activeElement?.closest(".profile") ? (selectedRow.current ?? searchInput.current) : null;
    setSelected(null);
    if (row) {
      requestAnimationFrame(() => row.focus());
    }
  }, []);

  // A row asked for from elsewhere: opened at once if it is on show for that search, else once the search finds it.
  useEffect(() => {
    if (!reveal) {
      return;
    }
    const row = page?.rows.find((candidate) => candidate.uid === reveal.uid);
    if (row !== undefined && query === reveal.query) {
      setSelected(row);
      return;
    }
    setPosition({ key: "", offset: 0 });
    wanted.current = reveal.uid;
    setQuery(reveal.query);
    // Only a new request counts: the rows and search it finds are read as they are then.
  }, [reveal]);

  // Another row replaces the profile, and with it the edits pending in it: the profile asks first. A detail has no edits,
  // and picking its row again folds it away.
  const pick = (row: Row) => {
    if (detail) {
      setSelected((open) => (open?.uid === row.uid ? null : row));
    } else if (profile) {
      if (row.uid === selected?.uid) {
        setSelected(row);
      } else {
        askToLeave(() => setSelected(row));
      }
    }
  };

  useEffect(() => {
    // Keep hidden lists mounted for navigation state, but defer their reads until opened.
    // In particular, building the stadium index must not delay the first player search.
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    const args: Record<string, unknown> = JSON.parse(argsKey);
    // Typing in the search box or a filter waits a little, so a burst of keys makes one request.
    // A list nobody has touched yet loads at once.
    const untouched = query === "" && argsKey === "{}";
    const timer = setTimeout(
      async () => {
        try {
          const result = await call<Page<Row>>(command, { ...args, query, limit: ROW_LIMIT, offset });
          if (!cancelled) {
            if (offset > 0 && offset >= result.total) {
              setPosition({ key: pageKey, offset: Math.max(0, Math.floor((result.total - 1) / ROW_LIMIT) * ROW_LIMIT) });
              return;
            }
            setLoading(false);
            setPage(result);
            setShownFor({ query, argsKey, offset, requestKey });
            setFailure(null);
            // The open profile shows its row as read now: after an edit, the values written.
            setSelected((open) => (open === null ? null : (result.rows.find((row) => row.uid === open.uid) ?? open)));
            if (shownArgs.current !== `${argsKey}:${query}:${offset}`) {
              // A new sort or filter starts at the top; reading the same list again keeps its place.
              shownArgs.current = `${argsKey}:${query}:${offset}`;
              tableWrap.current?.scrollTo({ top: 0 });
            }
            // The first rows decide: the row that was selected before the language was switched is selected again if
            // they have it, and not later, when the user has moved on.
            const uid = wanted.current;
            if (uid !== null) {
              wanted.current = null;
              const row = result.rows.find((candidate) => candidate.uid === uid);
              if (row !== undefined) {
                setSelected(row);
              }
            }
          }
        } catch (e) {
          if (!cancelled) {
            setLoading(false);
            setFailure({ requestKey, message: describeError(e) });
          }
        }
      },
      untouched ? 0 : 150,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [command, query, argsKey, version, active, offset, pageKey, attempt, requestKey]);

  useEffect(() => {
    if (!active) {
      return;
    }
    searchInput.current?.focus();
    // ⌘F goes to the search box, with its text selected so that typing replaces it.
    const find = (event: KeyboardEvent) => {
      if (isShortcut(event, "f")) {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
    };
    window.addEventListener("keydown", find);
    return () => window.removeEventListener("keydown", find);
  }, [active]);

  // The count names the table for assistive technology.
  const countId = useId();

  // The row Tab reaches in the table.
  const tabStop = page?.rows.some((row) => row.uid === selected?.uid) ? selected?.uid : page?.rows[0]?.uid;

  const settled = page !== null && shownFor?.requestKey === requestKey && !loading;
  const searching = !settled && error === null;

  // A hidden list has no profile open: its window-wide Escape handler must not fire.
  const showProfile = active && selected !== null && profile !== undefined;
  const className = ["workspace", showProfile && "with-profile", !active && "inactive"].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <section className="players">
        <div className="toolbar" data-tour={active ? "search" : undefined}>
          <label className="search">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5.5" />
              <path d="m13 13 4.5 4.5" />
            </svg>
            <input
              ref={searchInput}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={placeholder}
              aria-label={placeholder}
              aria-keyshortcuts={shortcutAria("f")}
              spellCheck={false}
            />
          </label>
          <span className="count" id={countId} role="status">{settled ? summary(page.total, page.total) : ""}</span>
          {toolbarActions?.({
            query,
            total: settled ? page.total : null,
            shown: settled ? page.rows.length : 0,
          })}
        </div>
        {filterBar}
        {error && <div className="banner" role="alert">{error} <button type="button" onClick={() => setAttempt((value) => value + 1)}>{feedback.retry}</button></div>}

        <div className="table-wrap" data-list-width={listWidth} aria-busy={searching} ref={tableWrap} data-tour={active ? "list" : undefined}>
          {/* A grid: the rows are picked with the arrow keys and Enter, and the picked one is selected. */}
          <table
            className={["grid", tableClass, !profile && !detail && "static"].filter(Boolean).join(" ")}
            role="grid"
            aria-label={settled && page ? summary(page.total, page.total) : error ? feedback.failed : feedback.searching}
          >
            <thead>
              <tr ref={headRow}>{header}</tr>
            </thead>
            <tbody>
              {settled && page?.rows.map((row, index) => {
                const isSelected = row.uid === selected?.uid;
                return (
                  <Fragment key={row.uid}>
                    <tr
                      ref={isSelected ? selectedRow : undefined}
                      className={isSelected ? "selected" : undefined}
                      aria-selected={profile || detail ? isSelected : undefined}
                      aria-expanded={detail ? isSelected : undefined}
                      // One row is a Tab stop, the selected one or else the first; the arrow keys reach the others.
                      tabIndex={row.uid === tabStop ? 0 : -1}
                      onClick={() => pick(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          pick(row);
                          return;
                        }
                        if (e.key === "Escape" && detail && isSelected) {
                          e.preventDefault();
                          setSelected(null);
                          return;
                        }
                        // The rows of the list, not the detail under one.
                        const rows = e.currentTarget.parentElement?.querySelectorAll(":scope > tr:not(.row-detail)");
                        const to =
                          e.key === "ArrowDown" ? index + 1
                          : e.key === "ArrowUp" ? index - 1
                          : e.key === "Home" ? 0
                          : e.key === "End" ? (rows?.length ?? 0) - 1
                          : null;
                        const target = to === null ? null : rows?.item(to);
                        if (target instanceof HTMLElement) {
                          e.preventDefault();
                          target.focus();
                        }
                      }}
                    >
                      {cells(row)}
                    </tr>
                    {detail && isSelected && (
                      <tr className="row-detail">
                        {/* Only a picked row has one, so the head is there to count the columns of. */}
                        <td colSpan={headRow.current?.cells.length ?? 1}>{detail(row)}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {searching && <p className="empty" role="status">{feedback.searching}</p>}
          {settled && page && page.rows.length === 0 && <p className="empty">{empty(query)}</p>}
        </div>
        {page && page.total > ROW_LIMIT && (
          <div className="pager-bar">
            <div className="pager" role="group" aria-label={pagingText.pages}>
              <button type="button" disabled={!settled || (shownFor?.offset ?? 0) === 0}
                onClick={() => goToPage(Math.max(0, (shownFor?.offset ?? 0) - ROW_LIMIT))}>
                {pagingText.previous}
              </button>
              <span className="pager-range" role="status">
                {settled ? pagingText.range((shownFor?.offset ?? 0) + 1, (shownFor?.offset ?? 0) + page.rows.length, page.total) : ""}
              </span>
              <button type="button" disabled={!settled || (shownFor?.offset ?? 0) + page.rows.length >= page.total}
                onClick={() => goToPage((shownFor?.offset ?? 0) + ROW_LIMIT)}>
                {pagingText.next}
              </button>
            </div>
          </div>
        )}
        {footer}
      </section>

      {showProfile && (
        <Fragment key={selected.uid}>{profile?.(selected, { version, onClose: closeProfile })}</Fragment>
      )}
    </div>
  );
}
