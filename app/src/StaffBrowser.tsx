import { useId, useState } from "react";
import { Ability } from "./Ability";
import { AttributeFilters, readAttributeRows, STAFF_ATTRIBUTES, toAttributeBounds } from "./AttributeFilters";
import { formatDate } from "./format";
import { JOB_FILTER_OPTIONS, jobLabel, profileText, staffListText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { ClubLogo, NationFlag, PICTURE_SIZE, WithPicture } from "./Picture";
import { restored, useSnapshot } from "./restore";
import { employerOf, HumanBadge, StaffProfile } from "./StaffProfile";
import type { StaffFilter, StaffSummary } from "./types";

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

/** The staff table with the profile of the selected member of staff beside it. */
export function StaffBrowser({ version, active }: { version: number; active: boolean }) {
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

  return (
    <ListBrowser<StaffSummary>
      name="staff"
      command="search_staff"
      requestArgs={{ filter }}
      version={version}
      active={active}
      placeholder={staffListText.search}
      summary={staffListText.summary}
      empty={(query) => staffListText.empty(query, filter !== undefined)}
      filterBar={
        <div className="filter-bar">
          <div className="filter-fields">
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
          </div>
        </div>
      }
      toolbarActions={(list) => <MassEditButton entity="staff" filters={{ staffFilter: filter }} list={list} />}
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
      profile={(s, panel) => <StaffProfile member={s} version={panel.version} onClose={panel.onClose} />}
    />
  );
}

function StaffCells({ staff: s }: { staff: StaffSummary }) {
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
      <td className="col-job" title={s.job === null ? undefined : jobLabel(s.job)}>
        {jobLabel(s.job)}
      </td>
      <td className="col-club" title={s.club ?? undefined}>
        <WithPicture picture={<ClubLogo uid={s.clubUid} name={s.club} size={PICTURE_SIZE.rowLogo} />}>
          {employerOf(s) ?? <span className="muted">{profileText.none}</span>}
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
