import { useContext, useId, useState } from "react";
import { Ability } from "./Ability";
import {
  attributeChips,
  AttributeFilters,
  readAttributeRows,
  STAFF_ATTRIBUTES,
  toAttributeBounds,
  type AttributeRow,
} from "./AttributeFilters";
import { BestForSelect, FitCell, FitHeader, useBestFor, YourBest } from "./BestFor";
import { STAFF_RECIPES, type Recipe } from "./recipes";
import { chipLabel, FilterBar, RangeField, rangeText, type FilterChip } from "./FilterBar";
import { formatDate } from "./format";
import { JOB_FILTER_OPTIONS, jobLabel, playerListText, profileText, staffListText } from "./labels";
import { ListBrowser, type Reveal } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { NationFlag, WithPicture } from "./Picture";
import { isRecord, restored, useSnapshot } from "./restore";
import { SavedFilterControls } from "./SavedFilterControls";
import { readPlain, savedKind } from "./savedFilters";
import { SortHeader, useListSort, type SortStart } from "./SortHeader";
import { EmployerPicture, employerOf, HumanBadge, jobOf, readStaffTab, StaffProfile } from "./StaffProfile";
import type { ListOrder, StaffFilter, StaffSort, StaffSummary, Yours } from "./types";
import { EditorContext } from "./useProfileEditing";
import { useTicks } from "./useTicks";

const AGE_RANGE = { min: 0, max: 99 };
const ABILITY_RANGE = { min: 1, max: 200 };

/** A whole number within `range`; nothing for an empty or unreadable input. */
function whole(input: string, range: { min: number; max: number }): number | undefined {
  if (input.trim() === "") {
    return undefined;
  }
  const value = Number(input);
  return Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, Math.round(value))) : undefined;
}

const readText = (value: unknown) => (typeof value === "string" ? value : "");

const columns = staffListText.columns;
const filters = staffListText.filters;
/** The words every list's ability range shares. */
const shared = playerListText.filters;

/** The columns the list sorts by. Until one is clicked the search answers with your manager, then the best first. */
const SORT: SortStart<StaffSort> = {
  sorts: ["name", "age", "club", "nation", "currentAbility", "potentialAbility"],
  start: { by: "currentAbility", ascending: false },
  firstAscending: ["name", "club", "nation"],
};

/** The inputs of the filter bar but the attribute rows, empty: what a saved filter holds of them. */
const NO_FIELDS = {
  job: "",
  unemployed: false,
  humanOnly: false,
  minAge: "",
  maxAge: "",
  minCurrentAbility: "",
  maxCurrentAbility: "",
  minPotentialAbility: "",
  maxPotentialAbility: "",
  nation: "",
  club: "",
};

type StaffFields = typeof NO_FIELDS & { attributes: AttributeRow[] };

const SAVED = savedKind<StaffFields, StaffSort>(
  "staff",
  (value) => ({
    ...readPlain(value, NO_FIELDS),
    attributes: readAttributeRows(isRecord(value) ? value.attributes : undefined, STAFF_ATTRIBUTES),
  }),
  SORT.sorts,
);

/** The job filter saved before the language was switched: a job the select offers, or "" for any. */
const readJob = (value: unknown) =>
  typeof value === "string" && JOB_FILTER_OPTIONS.some(({ code }) => String(code) === value) ? value : "";

interface StaffBrowserProps {
  version: number;
  /** Changes when another game is read: the staff ticked are of the game before. */
  game: number;
  active: boolean;
  reveal: Reveal | null;
}

/** The staff table with the profile of the selected member of staff beside it. */
export function StaffBrowser({ version, game, active, reveal }: StaffBrowserProps) {
  // The staff ticked for Mass edit, which takes them in place of the whole list; there is nothing to tick them for
  // while the game cannot be written to.
  const { editable } = useContext(EditorContext);
  const ticks = useTicks(game);
  // The filters start as they were before the language was switched, if it was (see `restore.ts`).
  // The job as the select holds it: a job code, or "" for any.
  const [job, setJob] = useState(() => restored("staffJob", readJob));
  const [unemployed, setUnemployed] = useState(() => restored("staffUnemployed", (value) => value === true));
  const [humanOnly, setHumanOnly] = useState(() => restored("staffHumanOnly", (value) => value === true));
  const [minAge, setMinAge] = useState(() => restored("staffMinAge", readText));
  const [maxAge, setMaxAge] = useState(() => restored("staffMaxAge", readText));
  const [minCurrentAbility, setMinCurrentAbility] = useState(() => restored("staffMinCa", readText));
  const [maxCurrentAbility, setMaxCurrentAbility] = useState(() => restored("staffMaxCa", readText));
  const [minPotentialAbility, setMinPotentialAbility] = useState(() => restored("staffMinPa", readText));
  const [maxPotentialAbility, setMaxPotentialAbility] = useState(() => restored("staffMaxPa", readText));
  const [nation, setNation] = useState(() => restored("staffNation", readText));
  const [club, setClub] = useState(() => restored("staffClub", readText));
  const [attributes, setAttributes] = useState(() =>
    restored("staffAttributes", (value) => readAttributeRows(value, STAFF_ATTRIBUTES)),
  );
  useSnapshot("staffJob", () => job);
  useSnapshot("staffUnemployed", () => unemployed);
  useSnapshot("staffHumanOnly", () => humanOnly);
  useSnapshot("staffMinAge", () => minAge);
  useSnapshot("staffMaxAge", () => maxAge);
  useSnapshot("staffMinCa", () => minCurrentAbility);
  useSnapshot("staffMaxCa", () => maxCurrentAbility);
  useSnapshot("staffMinPa", () => minPotentialAbility);
  useSnapshot("staffMaxPa", () => maxPotentialAbility);
  const best = useBestFor("staffBest", STAFF_RECIPES);
  const sort = useListSort("staffOrder", SORT, best.recipe !== undefined);
  // What a saved filter keeps of the bar, and how one is brought back.
  const fields: StaffFields = {
    job,
    unemployed,
    humanOnly,
    minAge,
    maxAge,
    minCurrentAbility,
    maxCurrentAbility,
    minPotentialAbility,
    maxPotentialAbility,
    nation,
    club,
    attributes,
  };
  const applySaved = (saved: StaffFields, order: ListOrder<StaffSort> | null) => {
    setJob(readJob(saved.job));
    setUnemployed(saved.unemployed);
    setHumanOnly(saved.humanOnly);
    setMinAge(saved.minAge);
    setMaxAge(saved.maxAge);
    setMinCurrentAbility(saved.minCurrentAbility);
    setMaxCurrentAbility(saved.maxCurrentAbility);
    setMinPotentialAbility(saved.minPotentialAbility);
    setMaxPotentialAbility(saved.maxPotentialAbility);
    setNation(saved.nation);
    setClub(saved.club);
    setAttributes(saved.attributes);
    sort.set(order);
  };
  useSnapshot("staffNation", () => nation);
  useSnapshot("staffClub", () => club);
  useSnapshot("staffAttributes", () => attributes);
  // The tab of the profile is kept here, so that the next person picked opens on it too.
  const [tab, setTab] = useState(() => restored("staffTab", readStaffTab));
  useSnapshot("staffTab", () => tab);
  const bounds = toAttributeBounds(attributes);
  const minAgeValue = whole(minAge, AGE_RANGE);
  const maxAgeValue = whole(maxAge, AGE_RANGE);
  const minCa = whole(minCurrentAbility, ABILITY_RANGE);
  const maxCa = whole(maxCurrentAbility, ABILITY_RANGE);
  const minPa = whole(minPotentialAbility, ABILITY_RANGE);
  const maxPa = whole(maxPotentialAbility, ABILITY_RANGE);
  const nationValue = nation.trim() || undefined;
  const clubValue = club.trim() || undefined;
  const filter: StaffFilter | undefined =
    job === "" &&
    !unemployed &&
    !humanOnly &&
    minAgeValue === undefined &&
    maxAgeValue === undefined &&
    minCa === undefined &&
    maxCa === undefined &&
    minPa === undefined &&
    maxPa === undefined &&
    nationValue === undefined &&
    clubValue === undefined &&
    bounds === undefined
      ? undefined
      : {
          job: job === "" ? undefined : Number(job),
          unemployed: unemployed || undefined,
          humanOnly: humanOnly || undefined,
          minAge: minAgeValue,
          maxAge: maxAgeValue,
          minCurrentAbility: minCa,
          maxCurrentAbility: maxCa,
          minPotentialAbility: minPa,
          maxPotentialAbility: maxPa,
          nation: nationValue,
          club: clubValue,
          attributes: bounds,
        };
  const ageLabel = useId();

  // A chip for each filter in effect; the two ends of the age range are one.
  const chips: FilterChip[] = [];
  const add = (key: string, label: string, remove: () => void) => chips.push({ key, label, remove });
  const age = rangeText(minAgeValue, maxAgeValue);
  if (job !== "") {
    add("job", chipLabel(filters.job, jobLabel(Number(job))), () => setJob(""));
  }
  if (unemployed) {
    add("unemployed", filters.unemployedOnly, () => setUnemployed(false));
  }
  if (humanOnly) {
    add("humanOnly", filters.humanOnly, () => setHumanOnly(false));
  }
  if (age !== null) {
    add("age", chipLabel(filters.age, age), () => {
      setMinAge("");
      setMaxAge("");
    });
  }
  const ability = rangeText(minCa, maxCa);
  const potential = rangeText(minPa, maxPa);
  if (ability !== null) {
    add("ability", chipLabel(columns.currentAbility, ability), () => {
      setMinCurrentAbility("");
      setMaxCurrentAbility("");
    });
  }
  if (potential !== null) {
    add("potential", chipLabel(columns.potentialAbility, potential), () => {
      setMinPotentialAbility("");
      setMaxPotentialAbility("");
    });
  }
  if (nationValue !== undefined) {
    add("nation", chipLabel(filters.nation, nationValue), () => setNation(""));
  }
  if (clubValue !== undefined) {
    add("club", chipLabel(filters.club, clubValue), () => setClub(""));
  }
  chips.push(...attributeChips(attributes, STAFF_ATTRIBUTES, setAttributes));
  const clearAll = () => {
    setJob("");
    setUnemployed(false);
    setHumanOnly(false);
    setMinAge("");
    setMaxAge("");
    setMinCurrentAbility("");
    setMaxCurrentAbility("");
    setMinPotentialAbility("");
    setMaxPotentialAbility("");
    setNation("");
    setClub("");
    setAttributes([]);
  };

  // A member of staff asked for from elsewhere is found whatever the filters were: they are cleared for them.
  const [revealed, setRevealed] = useState(reveal);
  if (revealed !== reveal) {
    setRevealed(reveal);
    if (reveal) {
      clearAll();
    }
  }

  return (
    <ListBrowser<StaffSummary>
      name="staff"
      reveal={reveal}
      command="search_staff"
      requestArgs={{ filter, order: sort.order ?? undefined, best: best.recipe?.best }}
      version={version}
      active={active}
      placeholder={staffListText.search}
      summary={staffListText.summary}
      empty={(query) => staffListText.empty(query, filter !== undefined)}
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
            <span>{filters.job}</span>
            <select value={job} onChange={(e) => setJob(e.currentTarget.value)}>
              <option value="">{filters.anyJob}</option>
              {JOB_FILTER_OPTIONS.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <input type="checkbox" checked={unemployed} onChange={(e) => setUnemployed(e.currentTarget.checked)} />
            <span>{filters.unemployedOnly}</span>
          </label>
          <label className="filter-field">
            <input type="checkbox" checked={humanOnly} onChange={(e) => setHumanOnly(e.currentTarget.checked)} />
            <span>{filters.humanOnly}</span>
          </label>
          <div className="filter-field" role="group" aria-labelledby={ageLabel}>
            <span id={ageLabel}>{filters.age}</span>
            <input
              type="number"
              min={AGE_RANGE.min}
              max={AGE_RANGE.max}
              step={1}
              placeholder={filters.minPlaceholder}
              aria-label={filters.minAge}
              value={minAge}
              onChange={(e) => setMinAge(e.currentTarget.value)}
            />
            <span aria-hidden="true">–</span>
            <input
              type="number"
              min={AGE_RANGE.min}
              max={AGE_RANGE.max}
              step={1}
              placeholder={filters.maxPlaceholder}
              aria-label={filters.maxAge}
              value={maxAge}
              onChange={(e) => setMaxAge(e.currentTarget.value)}
            />
          </div>
          <RangeField
            label={columns.currentAbility}
            minLabel={shared.minCurrentAbilityTitle}
            maxLabel={shared.maxCurrentAbilityTitle}
            range={ABILITY_RANGE}
            min={minCurrentAbility}
            max={maxCurrentAbility}
            onMin={setMinCurrentAbility}
            onMax={setMaxCurrentAbility}
          />
          <RangeField
            label={columns.potentialAbility}
            minLabel={shared.minPotentialAbilityTitle}
            maxLabel={shared.maxPotentialAbilityTitle}
            range={ABILITY_RANGE}
            min={minPotentialAbility}
            max={maxPotentialAbility}
            onMin={setMinPotentialAbility}
            onMax={setMaxPotentialAbility}
          />
          <label className="filter-field">
            <span>{filters.nation}</span>
            <input value={nation} onChange={(e) => setNation(e.currentTarget.value)} spellCheck={false} />
          </label>
          <label className="filter-field">
            <span>{filters.club}</span>
            <input value={club} onChange={(e) => setClub(e.currentTarget.value)} spellCheck={false} />
          </label>
          <AttributeFilters rows={attributes} choices={STAFF_ATTRIBUTES} onChange={setAttributes} />
        </FilterBar>
      }
      toolbarActions={(list) => (
        <>
          <BestForSelect
            recipes={STAFF_RECIPES}
            value={best.key}
            onChange={(key) => {
              best.set(key);
              sort.set(null);
            }}
          />
          <YourBest yours={list.yours} />
          <MassEditButton
            entity="staff"
            filters={{ staffFilter: filter }}
            list={list}
            ticked={editable ? ticks.uids : []}
          />
        </>
      )}
      ticking={editable ? { ticks, name: (s) => s.name } : undefined}
      tableClass="staff-grid"
      header={
        <>
          <SortHeader by="name" sort={sort} label={columns.name} className="col-name" />
          <SortHeader by="age" sort={sort} label={columns.age} className="num col-age" />
          <th className="col-job">{columns.job}</th>
          <SortHeader by="club" sort={sort} label={columns.club} className="col-club" />
          <SortHeader by="nation" sort={sort} label={columns.nation} className="col-nation" />
          <th className="col-born">{columns.born}</th>
          {best.recipe && <FitHeader sort={sort} />}
          <SortHeader
            by="currentAbility"
            sort={sort}
            label={columns.currentAbility}
            name={playerListText.sortNames.currentAbility}
            className="num col-ca"
          />
          <SortHeader
            by="potentialAbility"
            sort={sort}
            label={columns.potentialAbility}
            name={playerListText.sortNames.potentialAbility}
            className="num col-pa"
          />
          <th className="num col-uid">{columns.id}</th>
        </>
      }
      cells={(s, list) => <StaffCells staff={s} recipe={best.recipe} yours={list.yours} />}
      profile={(s, panel) => (
        <StaffProfile member={s} version={panel.version} tab={tab} onTab={setTab} onClose={panel.onClose} />
      )}
    />
  );
}

function StaffCells({
  staff: s,
  recipe,
  yours,
}: {
  staff: StaffSummary;
  recipe: Recipe | undefined;
  yours: Yours | null;
}) {
  const job = jobOf(s);
  const employer = employerOf(s);
  return (
    <>
      <td className="col-name">
        <div className="name">
          {s.name}
          {s.isHuman && <HumanBadge />}
        </div>
        {s.fullName && s.fullName !== s.name && <div className="sub">{s.fullName}</div>}
      </td>
      <td className="num col-age">{s.age ?? profileText.none}</td>
      {/* A long job or club is cut short with an ellipsis (see App.css); the hover text has all of it. */}
      <td className="col-job" title={job === null ? undefined : jobLabel(job)}>
        {jobLabel(job)}
      </td>
      <td className="col-club" title={typeof employer === "string" ? employer : undefined}>
        <WithPicture picture={<EmployerPicture member={s} />}>
          {employer ?? <span className="muted">{profileText.none}</span>}
        </WithPicture>
      </td>
      <td className="col-nation">
        <WithPicture picture={<NationFlag uid={s.nationUid} />}>{s.nation ?? profileText.none}</WithPicture>
      </td>
      <td className="date col-born">{formatDate(s.dateOfBirth)}</td>
      {recipe && <FitCell recipe={recipe} fit={s.fit} yours={yours} />}
      <td className="num col-ca">
        <Ability value={s.currentAbility} />
      </td>
      <td className="num col-pa">
        <Ability value={s.potentialAbility} />
      </td>
      <td className="num uid col-uid">{s.uid}</td>
    </>
  );
}
