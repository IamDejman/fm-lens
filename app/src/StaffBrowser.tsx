import { useContext, useId, useState } from "react";
import { Ability } from "./Ability";
import {
  attributeChips,
  AttributeFilters,
  readAttributeRows,
  STAFF_ATTRIBUTES,
  toAttributeBounds,
} from "./AttributeFilters";
import { chipLabel, FilterBar, rangeText, type FilterChip } from "./FilterBar";
import { formatDate } from "./format";
import { JOB_FILTER_OPTIONS, jobLabel, profileText, staffListText } from "./labels";
import { ListBrowser, type Reveal } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { NationFlag, WithPicture } from "./Picture";
import { restored, useSnapshot } from "./restore";
import { EmployerPicture, employerOf, HumanBadge, jobOf, readStaffTab, StaffProfile } from "./StaffProfile";
import type { StaffFilter, StaffSummary } from "./types";
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
  const [minPotentialAbility, setMinPotentialAbility] = useState(() => restored("staffMinPa", readText));
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
  useSnapshot("staffMinPa", () => minPotentialAbility);
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
  const minPa = whole(minPotentialAbility, ABILITY_RANGE);
  const nationValue = nation.trim() || undefined;
  const clubValue = club.trim() || undefined;
  const filter: StaffFilter | undefined =
    job === "" &&
    !unemployed &&
    !humanOnly &&
    minAgeValue === undefined &&
    maxAgeValue === undefined &&
    minCa === undefined &&
    minPa === undefined &&
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
          minPotentialAbility: minPa,
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
  if (minCa !== undefined) {
    add("minCa", chipLabel(filters.minCurrentAbility, String(minCa)), () => setMinCurrentAbility(""));
  }
  if (minPa !== undefined) {
    add("minPa", chipLabel(filters.minPotentialAbility, String(minPa)), () => setMinPotentialAbility(""));
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
    setMinPotentialAbility("");
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
      requestArgs={{ filter }}
      version={version}
      active={active}
      placeholder={staffListText.search}
      summary={staffListText.summary}
      empty={(query) => staffListText.empty(query, filter !== undefined)}
      filterBar={
        <FilterBar chips={chips} onClear={clearAll}>
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
          <label className="filter-field" title={filters.minCurrentAbilityTitle}>
            <span>{filters.minCurrentAbility}</span>
            <input
              type="number"
              min={ABILITY_RANGE.min}
              max={ABILITY_RANGE.max}
              step={1}
              placeholder={filters.abilityPlaceholder}
              value={minCurrentAbility}
              onChange={(e) => setMinCurrentAbility(e.currentTarget.value)}
            />
          </label>
          <label className="filter-field" title={filters.minPotentialAbilityTitle}>
            <span>{filters.minPotentialAbility}</span>
            <input
              type="number"
              min={ABILITY_RANGE.min}
              max={ABILITY_RANGE.max}
              step={1}
              placeholder={filters.abilityPlaceholder}
              value={minPotentialAbility}
              onChange={(e) => setMinPotentialAbility(e.currentTarget.value)}
            />
          </label>
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
        <MassEditButton
          entity="staff"
          filters={{ staffFilter: filter }}
          list={list}
          ticked={editable ? ticks.uids : []}
        />
      )}
      ticking={editable ? { ticks, name: (s) => s.name } : undefined}
      tableClass="staff-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="num col-age">{columns.age}</th>
          <th className="col-job">{columns.job}</th>
          <th className="col-club">{columns.club}</th>
          <th className="col-nation">{columns.nation}</th>
          <th className="col-born">{columns.born}</th>
          <th className="num col-ca">{columns.currentAbility}</th>
          <th className="num col-pa">{columns.potentialAbility}</th>
          <th className="num col-uid">{columns.id}</th>
        </>
      }
      cells={(s) => <StaffCells staff={s} />}
      profile={(s, panel) => (
        <StaffProfile member={s} version={panel.version} tab={tab} onTab={setTab} onClose={panel.onClose} />
      )}
    />
  );
}

function StaffCells({ staff: s }: { staff: StaffSummary }) {
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
