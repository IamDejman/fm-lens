import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { call } from "./api";
import { askToLeave } from "./useProfileEditing";

/** Rows shown at once; the best come first. */
const ROW_LIMIT = 200;

interface Page<Row> {
  total: number;
  rows: Row[];
}

interface ListBrowserProps<Row extends { uid: number }> {
  /**
   * The Rust command that searches, e.g. "search_players". It takes `{ query, limit, ...requestArgs }` and
   * returns a page.
   */
  command: string;
  /**
   * Arguments for the command besides `query` and `limit`, e.g. `{ filter, order }`. They are compared by
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
  /** An extra class of the table, for column rules of that list. */
  tableClass?: string;
  /** The header cells. */
  header: ReactNode;
  /** The cells of one row. */
  cells: (row: Row) => ReactNode;
  /** The profile panel of the selected row. */
  profile: (row: Row, panel: { version: number; onClose: () => void }) => ReactNode;
}

/** A searchable table with the profile of the selected row beside it. */
export function ListBrowser<Row extends { uid: number }>(props: ListBrowserProps<Row>) {
  const { command, requestArgs, version, active, placeholder, summary, empty, filterBar } = props;
  const { tableClass, header, cells, profile } = props;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<Page<Row> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const tableWrap = useRef<HTMLDivElement>(null);
  const selectedRow = useRef<HTMLTableRowElement>(null);

  // The arguments as JSON, which is how they reach the command: the effect below depends on their value.
  const argsKey = JSON.stringify(requestArgs ?? {});
  // The arguments of the rows on show, so a new sort or filter can start at the top.
  const shownArgs = useRef(argsKey);

  const closeProfile = useCallback(() => {
    // The panel unmounts with the focused control inside it; keep keyboard focus in the table.
    if (document.activeElement?.closest(".profile")) {
      selectedRow.current?.focus();
    }
    setSelected(null);
  }, []);

  // Another row replaces the profile, and with it the edits pending in it: the profile asks first.
  const pick = (row: Row) => (row.uid === selected?.uid ? setSelected(row) : askToLeave(() => setSelected(row)));

  useEffect(() => {
    let cancelled = false;
    const args: Record<string, unknown> = JSON.parse(argsKey);
    // Typing in the search box or a filter waits a little, so a burst of keys makes one request.
    // A list nobody has touched yet loads at once.
    const untouched = query === "" && argsKey === "{}";
    const timer = setTimeout(
      async () => {
        try {
          const result = await call<Page<Row>>(command, { ...args, query, limit: ROW_LIMIT });
          if (!cancelled) {
            setPage(result);
            setError(null);
            if (shownArgs.current !== argsKey) {
              // A new sort or filter starts at the top; reading the same list again keeps its place.
              shownArgs.current = argsKey;
              tableWrap.current?.scrollTo({ top: 0 });
            }
          }
        } catch (e) {
          if (!cancelled) {
            setError(String(e));
          }
        }
      },
      untouched ? 0 : 150,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [command, query, argsKey, version]);

  useEffect(() => {
    if (active) {
      searchInput.current?.focus();
    }
  }, [active]);

  // A hidden list has no profile open: its window-wide Escape handler must not fire.
  const showProfile = active && selected !== null;
  const className = ["workspace", showProfile && "with-profile", !active && "inactive"].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <section className="players">
        <div className="toolbar">
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
              spellCheck={false}
            />
          </label>
          <span className="count">{page ? summary(page.total, page.rows.length) : ""}</span>
        </div>
        {filterBar}
        {error && <div className="banner">{error}</div>}

        <div className="table-wrap" ref={tableWrap}>
          <table className={tableClass ? `grid ${tableClass}` : "grid"}>
            <thead>
              <tr>{header}</tr>
            </thead>
            <tbody>
              {page?.rows.map((row) => {
                const isSelected = row.uid === selected?.uid;
                return (
                  <tr
                    key={row.uid}
                    ref={isSelected ? selectedRow : undefined}
                    className={isSelected ? "selected" : undefined}
                    aria-current={isSelected ? "true" : undefined}
                    tabIndex={0}
                    onClick={() => pick(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        pick(row);
                      }
                    }}
                  >
                    {cells(row)}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {page && page.rows.length === 0 && <p className="empty">{empty(query)}</p>}
        </div>
      </section>

      {showProfile && (
        <Fragment key={selected.uid}>{profile(selected, { version, onClose: closeProfile })}</Fragment>
      )}
    </div>
  );
}
