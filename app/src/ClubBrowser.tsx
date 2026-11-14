import { useId, useState } from "react";
import { ClubProfile, readTab, type ClubTab } from "./ClubProfile";
import { chipLabel, FilterBar, rangeText, type FilterChip } from "./FilterBar";
import { formatNumber } from "./format";
import { clubListText, playerListText, profileText } from "./labels";
import { ListBrowser, type Reveal } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { ClubLogo, NationFlag, PICTURE_SIZE, WithPicture } from "./Picture";
import { ReputationMeter } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import { SavedFilterControls } from "./SavedFilterControls";
import { readPlain, savedKind } from "./savedFilters";
import { SortHeader, useListSort, type SortStart } from "./SortHeader";
import type { ClubFilter, ClubSort, ClubSummary, ListOrder } from "./types";

const columns = clubListText.columns;
const filters = clubListText.filters;
/** What the players list calls a nation: the column and the filter here say the same. */
const nationLabel = playerListText.columns.nation;

/** The columns the list sorts by. Until one is clicked the search answers with the highest reputation first. */
const SORT: SortStart<ClubSort> = {
  sorts: ["name", "nation", "reputation", "founded"],
  start: { by: "reputation", ascending: false },
  firstAscending: ["name", "nation", "founded"],
};

/** The inputs of the filter bar, empty: what a saved filter holds. */
const NO_FIELDS = {
  kind: "all",
  minReputation: "",
  maxReputation: "",
  foundedFrom: "",
  foundedTo: "",
  nation: "",
};
type ClubFields = typeof NO_FIELDS;

const SAVED = savedKind<ClubFields, ClubSort>("clubs", (value) => readPlain(value, NO_FIELDS), SORT.sorts);

/** Which clubs the list shows. */
type ClubKind = "all" | "men" | "women";

/** The kind of clubs saved before the language was switched; all of them when there is none. */
const readKind = (value: unknown): ClubKind => (value === "men" || value === "women" ? value : "all");

const REPUTATION_RANGE = { min: 0, max: 10000 };
const YEAR_RANGE = { min: 1800, max: 2200 };

/** A whole number within `range`; nothing for an empty or unreadable input. */
function whole(input: string, range: { min: number; max: number }): number | undefined {
  if (input.trim() === "") {
    return undefined;
  }
  const value = Number(input);
  return Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, Math.round(value))) : undefined;
}

const readText = (value: unknown) => (typeof value === "string" ? value : "");

/** The clubs table with the profile of the selected club beside it. */
export function ClubBrowser({ version, active, reveal }: { version: number; active: boolean; reveal: Reveal | null }) {
  // It starts as it was before the language was switched, if it was (see `restore.ts`).
  const [kind, setKind] = useState<ClubKind>(() => restored("clubKind", readKind));
  const [minReputation, setMinReputation] = useState(() => restored("clubMinRep", readText));
  const [maxReputation, setMaxReputation] = useState(() => restored("clubMaxRep", readText));
  const [foundedFrom, setFoundedFrom] = useState(() => restored("clubFoundedFrom", readText));
  const [foundedTo, setFoundedTo] = useState(() => restored("clubFoundedTo", readText));
  const [nation, setNation] = useState(() => restored("clubNation", readText));
  useSnapshot("clubNation", () => nation);
  const sort = useListSort("clubOrder", SORT);
  // What a saved filter keeps of the bar, and how one is brought back.
  const fields: ClubFields = { kind, minReputation, maxReputation, foundedFrom, foundedTo, nation };
  const applySaved = (saved: ClubFields, order: ListOrder<ClubSort> | null) => {
    setKind(readKind(saved.kind));
    setMinReputation(saved.minReputation);
    setMaxReputation(saved.maxReputation);
    setFoundedFrom(saved.foundedFrom);
    setFoundedTo(saved.foundedTo);
    setNation(saved.nation);
    sort.set(order);
  };
  useSnapshot("clubKind", () => kind);
  useSnapshot("clubMinRep", () => minReputation);
  useSnapshot("clubMaxRep", () => maxReputation);
  useSnapshot("clubFoundedFrom", () => foundedFrom);
  useSnapshot("clubFoundedTo", () => foundedTo);
  // The tab of the club profile is kept here, so that the next club picked opens on the squad when this one did.
  const [tab, setTab] = useState<ClubTab>(() => restored("clubTab", readTab));
  useSnapshot("clubTab", () => tab);
  // A club asked for from elsewhere (the user's own, from the top bar) opens on its squad.
  const [revealed, setRevealed] = useState(reveal);
  if (revealed !== reveal) {
    setRevealed(reveal);
    if (reveal) {
      setTab("squad");
    }
  }
  const minRep = whole(minReputation, REPUTATION_RANGE);
  const maxRep = whole(maxReputation, REPUTATION_RANGE);
  const fromYear = whole(foundedFrom, YEAR_RANGE);
  const toYear = whole(foundedTo, YEAR_RANGE);
  const nationValue = nation.trim() || undefined;
  const filter: ClubFilter | undefined =
    kind === "all" &&
    minRep === undefined &&
    maxRep === undefined &&
    fromYear === undefined &&
    toYear === undefined &&
    nationValue === undefined
      ? undefined
      : {
          women: kind === "all" ? undefined : kind === "women",
          minReputation: minRep,
          maxReputation: maxRep,
          foundedFrom: fromYear,
          foundedTo: toYear,
          nation: nationValue,
        };
  const reputationLabel = useId();
  const foundedLabel = useId();

  // A chip for each filter in effect; the two ends of a range are one.
  const chips: FilterChip[] = [];
  const reputation = rangeText(minRep, maxRep, formatNumber);
  const founded = rangeText(fromYear, toYear);
  if (kind !== "all") {
    chips.push({ key: "kind", label: kind === "men" ? filters.men : filters.women, remove: () => setKind("all") });
  }
  if (reputation !== null) {
    chips.push({
      key: "reputation",
      label: chipLabel(filters.reputation, reputation),
      remove: () => {
        setMinReputation("");
        setMaxReputation("");
      },
    });
  }
  if (founded !== null) {
    chips.push({
      key: "founded",
      label: chipLabel(filters.founded, founded),
      remove: () => {
        setFoundedFrom("");
        setFoundedTo("");
      },
    });
  }
  if (nationValue !== undefined) {
    chips.push({ key: "nation", label: chipLabel(nationLabel, nationValue), remove: () => setNation("") });
  }
  const clearAll = () => {
    setKind("all");
    setMinReputation("");
    setMaxReputation("");
    setFoundedFrom("");
    setFoundedTo("");
    setNation("");
  };

  return (
    <ListBrowser<ClubSummary>
      name="clubs"
      reveal={reveal}
      command="search_clubs"
      requestArgs={{ filter, order: sort.order ?? undefined }}
      version={version}
      active={active}
      placeholder={clubListText.search}
      summary={clubListText.summary}
      empty={(query) => clubListText.empty(query, filter !== undefined)}
      filterBar={
        <FilterBar
          chips={chips}
          onClear={clearAll}
          actions={
            <SavedFilterControls
              kind={SAVED}
              fields={fields}
              order={sort.order}
              filtered={chips.length > 0}
              onApply={applySaved}
            />
          }
        >
          <label className="filter-field">
            <span>{filters.kind}</span>
            <select aria-label={filters.kind} value={kind} onChange={(e) => setKind(e.currentTarget.value as ClubKind)}>
              <option value="all">{filters.all}</option>
              <option value="men">{filters.men}</option>
              <option value="women">{filters.women}</option>
            </select>
          </label>
          <div className="filter-field" role="group" aria-labelledby={reputationLabel}>
            <span id={reputationLabel}>{filters.reputation}</span>
            <input
              type="number"
              min={REPUTATION_RANGE.min}
              max={REPUTATION_RANGE.max}
              step={1}
              placeholder={filters.minPlaceholder}
              aria-label={filters.minReputation}
              value={minReputation}
              onChange={(e) => setMinReputation(e.currentTarget.value)}
            />
            <span aria-hidden="true">–</span>
            <input
              type="number"
              min={REPUTATION_RANGE.min}
              max={REPUTATION_RANGE.max}
              step={1}
              placeholder={filters.maxPlaceholder}
              aria-label={filters.maxReputation}
              value={maxReputation}
              onChange={(e) => setMaxReputation(e.currentTarget.value)}
            />
          </div>
          <div className="filter-field" role="group" aria-labelledby={foundedLabel}>
            <span id={foundedLabel}>{filters.founded}</span>
            <input
              type="number"
              min={YEAR_RANGE.min}
              max={YEAR_RANGE.max}
              step={1}
              placeholder={filters.yearPlaceholder}
              aria-label={filters.foundedFrom}
              value={foundedFrom}
              onChange={(e) => setFoundedFrom(e.currentTarget.value)}
            />
            <span aria-hidden="true">–</span>
            <input
              type="number"
              min={YEAR_RANGE.min}
              max={YEAR_RANGE.max}
              step={1}
              placeholder={filters.yearPlaceholder}
              aria-label={filters.foundedTo}
              value={foundedTo}
              onChange={(e) => setFoundedTo(e.currentTarget.value)}
            />
          </div>
          <label className="filter-field">
            <span>{nationLabel}</span>
            <input
              value={nation}
              onChange={(e) => setNation(e.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </FilterBar>
      }
      toolbarActions={(list) => <MassEditButton entity="club" filters={{ clubFilter: filter }} list={list} />}
      tableClass="club-grid"
      header={
        <>
          <SortHeader by="name" sort={sort} label={columns.name} className="col-name" />
          <SortHeader by="nation" sort={sort} label={nationLabel} className="col-nation" />
          <SortHeader by="reputation" sort={sort} label={columns.reputation} className="num col-rep" />
          <SortHeader by="founded" sort={sort} label={columns.founded} className="num col-founded" />
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(c) => <ClubCells club={c} />}
      profile={(c, panel) => (
        <ClubProfile club={c} version={panel.version} tab={tab} onTab={setTab} onClose={panel.onClose} />
      )}
    />
  );
}

function ClubCells({ club: c }: { club: ClubSummary }) {
  return (
    <>
      <td className="col-name" title={c.name}>
        <WithPicture picture={<ClubLogo uid={c.uid} name={c.name} size={PICTURE_SIZE.clubRowLogo} />}>
          <div className="name">
            <span className="name-text">{c.name}</span>
            {c.women && <span className="tag women">{clubListText.women}</span>}
          </div>
          {c.shortName && c.shortName !== c.name && <div className="sub">{c.shortName}</div>}
        </WithPicture>
      </td>
      <td className="col-nation" title={c.nation ?? undefined}>
        <WithPicture picture={<NationFlag uid={c.nationUid} />}>{c.nation ?? profileText.none}</WithPicture>
      </td>
      <td className="num col-rep">
        <ReputationMeter value={c.reputation} />
      </td>
      {/* A year, so it is printed as it is: no thousands separator. */}
      <td className="num date col-founded">{c.founded ?? profileText.none}</td>
      <td className="num uid col-uid">{c.uid}</td>
    </>
  );
}
