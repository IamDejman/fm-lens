import { useState } from "react";
import {
  chipLabel,
  FilterBar,
  type FilterChip,
  KindField,
  kindChip,
  RangeField,
  rangeText,
  readKind,
  readText,
  whole,
  womenOnly,
} from "./FilterBar";
import { formatNumber } from "./format";
import { competitionListText, editText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { NationFlag, WithPicture } from "./Picture";
import { Fact, useProfileDetails } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import { SavedFilterControls } from "./SavedFilterControls";
import { readPlain, savedKind } from "./savedFilters";
import { SortHeader, useListSort, type SortStart } from "./SortHeader";
import type { CompetitionFilter, CompetitionRule, CompetitionSort, CompetitionSummary, ListOrder } from "./types";

const text = competitionListText;
const columns = text.columns;
const filters = text.filters;
const REPUTATION_RANGE = { min: 0, max: 200 };

/** The columns the list sorts by. Until one is clicked the search answers with the highest reputation first. */
const SORT: SortStart<CompetitionSort> = {
  sorts: ["name", "nation", "continent", "reputation"],
  start: { by: "reputation", ascending: false },
  firstAscending: ["name", "nation", "continent"],
};

/** The inputs of the filter bar, empty: what a saved filter holds. */
const NO_FIELDS = { kind: "all", nation: "", continent: "", minReputation: "", maxReputation: "" };
type CompetitionFields = typeof NO_FIELDS;

const SAVED = savedKind<CompetitionFields, CompetitionSort>("competitions", (value) => readPlain(value, NO_FIELDS), SORT.sorts);

/**
 * The competitions, highest reputation first. A row holds all FM Lens knows of a competition but its short name and
 * its rules: those open under it, and the table keeps its whole width.
 */
export function CompetitionBrowser({ version, active }: { version: number; active: boolean }) {
  // The filters start as they were before the language was switched, if it was (see `restore.ts`).
  const [kind, setKind] = useState(() => restored("competitionKind", readKind));
  const [nation, setNation] = useState(() => restored("competitionNation", readText));
  const [continent, setContinent] = useState(() => restored("competitionContinent", readText));
  const [minReputation, setMinReputation] = useState(() => restored("competitionMinRep", readText));
  const [maxReputation, setMaxReputation] = useState(() => restored("competitionMaxRep", readText));
  useSnapshot("competitionKind", () => kind);
  useSnapshot("competitionNation", () => nation);
  useSnapshot("competitionContinent", () => continent);
  useSnapshot("competitionMinRep", () => minReputation);
  useSnapshot("competitionMaxRep", () => maxReputation);
  const sort = useListSort("competitionOrder", SORT);
  // What a saved filter keeps of the bar, and how one is brought back.
  const fields: CompetitionFields = { kind, nation, continent, minReputation, maxReputation };
  const applySaved = (saved: CompetitionFields, order: ListOrder<CompetitionSort> | null) => {
    setKind(readKind(saved.kind));
    setNation(saved.nation);
    setContinent(saved.continent);
    setMinReputation(saved.minReputation);
    setMaxReputation(saved.maxReputation);
    sort.set(order);
  };
  const nationValue = nation.trim() || undefined;
  const continentValue = continent.trim() || undefined;
  const minRep = whole(minReputation, REPUTATION_RANGE);
  const maxRep = whole(maxReputation, REPUTATION_RANGE);
  const filter: CompetitionFilter | undefined =
    kind === "all" &&
    nationValue === undefined &&
    continentValue === undefined &&
    minRep === undefined &&
    maxRep === undefined
      ? undefined
      : {
          women: womenOnly(kind),
          nation: nationValue,
          continent: continentValue,
          minReputation: minRep,
          maxReputation: maxRep,
        };

  // A chip for each filter in effect; the two ends of the reputation range are one.
  const chips: FilterChip[] = kindChip(kind, filters, () => setKind("all"));
  const reputation = rangeText(minRep, maxRep);
  if (nationValue !== undefined) {
    chips.push({ key: "nation", label: chipLabel(filters.nation, nationValue), remove: () => setNation("") });
  }
  if (continentValue !== undefined) {
    chips.push({
      key: "continent",
      label: chipLabel(filters.continent, continentValue),
      remove: () => setContinent(""),
    });
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
  const clearAll = () => {
    setKind("all");
    setNation("");
    setContinent("");
    setMinReputation("");
    setMaxReputation("");
  };

  return (
    <ListBrowser<CompetitionSummary>
      name="competitions"
      command="search_competitions"
      requestArgs={{ filter, order: sort.order ?? undefined }}
      version={version}
      active={active}
      placeholder={text.search}
      summary={text.summary}
      empty={(query) => text.empty(query, filter !== undefined)}
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
          <KindField labels={filters} value={kind} onChange={setKind} />
          <label className="filter-field">
            <span>{filters.nation}</span>
            <input
              value={nation}
              onChange={(e) => setNation(e.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="filter-field">
            <span>{filters.continent}</span>
            <input
              value={continent}
              onChange={(e) => setContinent(e.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <RangeField
            label={filters.reputation}
            minLabel={filters.minReputation}
            maxLabel={filters.maxReputation}
            range={REPUTATION_RANGE}
            min={minReputation}
            max={maxReputation}
            onMin={setMinReputation}
            onMax={setMaxReputation}
          />
        </FilterBar>
      }
      tableClass="competition-grid"
      header={
        <>
          <SortHeader by="name" sort={sort} label={columns.name} className="col-name" />
          <SortHeader by="nation" sort={sort} label={columns.nation} className="col-nation" />
          <SortHeader by="continent" sort={sort} label={columns.continent} className="col-continent" />
          <SortHeader by="reputation" sort={sort} label={columns.reputation} className="num col-rep" />
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(competition) => <CompetitionCells competition={competition} />}
      detail={(competition) => <CompetitionDetail competition={competition} version={version} />}
    />
  );
}

function CompetitionCells({ competition }: { competition: CompetitionSummary }) {
  return (
    <>
      <td className="col-name" title={competition.name}>
        <span className="name">
          <span className="name-text">{competition.name}</span>
          {competition.women && <span className="tag women">{text.women}</span>}
        </span>
      </td>
      <td className="col-nation" title={competition.nation ?? undefined}>
        {competition.nation === null ? (
          profileText.none
        ) : (
          <WithPicture picture={<NationFlag uid={competition.nationUid} />}>{competition.nation}</WithPicture>
        )}
      </td>
      <td className="col-continent">{competition.continent ?? profileText.none}</td>
      <td className="num col-rep">{formatNumber(competition.reputation)}</td>
      <td className="num uid col-uid">{competition.uid}</td>
    </>
  );
}

const ruleNames: Record<string, string> = text.ruleNames;

/**
 * Under a competition's row: its short name where it differs, and the rules FM keeps as plain numbers and yes-or-no
 * values, or a hyphen where it has none to show.
 */
function CompetitionDetail({ competition, version }: { competition: CompetitionSummary; version: number }) {
  const loaded = useProfileDetails<CompetitionRule[] | null>("competition_rules", competition.uid, version);
  if (loaded?.error !== undefined) {
    return <p className="note">{loaded.error}</p>;
  }
  const rules = loaded?.details ?? [];
  const shortName = competition.shortName !== competition.name ? competition.shortName : null;
  return (
    <dl className="stats" aria-busy={loaded === null || undefined}>
      {shortName && <Fact label={text.shortName}>{shortName}</Fact>}
      {loaded !== null && rules.length === 0 && <Fact label={text.rules}>{profileText.none}</Fact>}
      {rules.map((rule) => (
        <Fact key={rule.key} label={ruleNames[rule.key] ?? rule.key}>
          {typeof rule.value === "boolean" ? (rule.value ? editText.yes : editText.no) : formatNumber(rule.value)}
        </Fact>
      ))}
    </dl>
  );
}
