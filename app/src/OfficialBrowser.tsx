import { useState } from "react";
import { Ability } from "./Ability";
import { EditableValue } from "./EditControls";
import { chipLabel, FilterBar, type FilterChip, RangeField, rangeText, readText, whole } from "./FilterBar";
import { formatNumber } from "./format";
import { officialListText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { NationFlag, WithPicture } from "./Picture";
import { Born, Fact, ProfileFrame, ReputationMeter } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import type { OfficialFilter, OfficialSummary } from "./types";
import { useProfileEditing } from "./useProfileEditing";

const text = officialListText;
const columns = text.columns;
const filters = text.filters;
const AGE_RANGE = { min: 0, max: 99 };
const ABILITY_RANGE = { min: 1, max: 200 };

/** The match officials, best first, with the selected official beside the table. */
export function OfficialBrowser({
  version,
  active,
}: {
  version: number;
  active: boolean;
}) {
  // The filters start as they were before the language was switched, if it was (see `restore.ts`).
  const [minAge, setMinAge] = useState(() => restored("officialMinAge", readText));
  const [maxAge, setMaxAge] = useState(() => restored("officialMaxAge", readText));
  const [minCurrentAbility, setMinCurrentAbility] = useState(() => restored("officialMinCa", readText));
  const [minPotentialAbility, setMinPotentialAbility] = useState(() => restored("officialMinPa", readText));
  const [nation, setNation] = useState(() => restored("officialNation", readText));
  useSnapshot("officialMinAge", () => minAge);
  useSnapshot("officialMaxAge", () => maxAge);
  useSnapshot("officialMinCa", () => minCurrentAbility);
  useSnapshot("officialMinPa", () => minPotentialAbility);
  useSnapshot("officialNation", () => nation);
  const minAgeValue = whole(minAge, AGE_RANGE);
  const maxAgeValue = whole(maxAge, AGE_RANGE);
  const minCa = whole(minCurrentAbility, ABILITY_RANGE);
  const minPa = whole(minPotentialAbility, ABILITY_RANGE);
  const nationValue = nation.trim() || undefined;
  const filter: OfficialFilter | undefined =
    minAgeValue === undefined &&
    maxAgeValue === undefined &&
    minCa === undefined &&
    minPa === undefined &&
    nationValue === undefined
      ? undefined
      : {
          minAge: minAgeValue,
          maxAge: maxAgeValue,
          minCurrentAbility: minCa,
          minPotentialAbility: minPa,
          nation: nationValue,
        };

  // A chip for each filter in effect; the two ends of the age range are one.
  const chips: FilterChip[] = [];
  const add = (key: string, label: string, remove: () => void) => chips.push({ key, label, remove });
  const age = rangeText(minAgeValue, maxAgeValue);
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
  const clearAll = () => {
    setMinAge("");
    setMaxAge("");
    setMinCurrentAbility("");
    setMinPotentialAbility("");
    setNation("");
  };

  return (
    <ListBrowser<OfficialSummary>
      name="officials"
      command="search_officials"
      requestArgs={{ filter }}
      version={version}
      active={active}
      placeholder={text.search}
      summary={text.summary}
      empty={(query) => text.empty(query, filter !== undefined)}
      filterBar={
        <FilterBar chips={chips} onClear={clearAll}>
          <RangeField
            label={filters.age}
            minLabel={filters.minAge}
            maxLabel={filters.maxAge}
            range={AGE_RANGE}
            min={minAge}
            max={maxAge}
            onMin={setMinAge}
            onMax={setMaxAge}
          />
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
            <input
              value={nation}
              onChange={(e) => setNation(e.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </FilterBar>
      }
      tableClass="official-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="num col-age">{columns.age}</th>
          <th className="col-nation">{columns.nation}</th>
          <th className="num col-rep">{columns.reputation}</th>
          <th className="num col-ca">{columns.ca}</th>
          <th className="num col-pa">{columns.pa}</th>
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(official) => <OfficialCells official={official} />}
      profile={(official, panel) => (
        <OfficialProfile official={official} onClose={panel.onClose} />
      )}
    />
  );
}

function OfficialCells({ official }: { official: OfficialSummary }) {
  return (
    <>
      <td className="col-name" title={official.name}>
        {official.name}
      </td>
      <td className="num col-age">{official.age ?? profileText.none}</td>
      <td className="col-nation" title={official.nation ?? undefined}>
        <WithPicture picture={<NationFlag uid={official.nationUid} />}>
          {official.nation ?? profileText.none}
        </WithPicture>
      </td>
      <td className="num col-rep">{formatNumber(official.reputation)}</td>
      <td className="num col-ca">
        <Ability value={official.currentAbility} />
      </td>
      <td className="num col-pa">
        <Ability value={official.potentialAbility} />
      </td>
      <td className="num uid col-uid">{official.uid}</td>
    </>
  );
}

/** An official's profile: what the list reads, as facts; abilities, reputation and birth date can be edited. */
function OfficialProfile({
  official,
  onClose,
}: {
  official: OfficialSummary;
  onClose: () => void;
}) {
  const editing = useProfileEditing("official", official.uid);
  const age = official.age === null ? null : profileText.age(official.age);
  return (
    <ProfileFrame
      picture={
        <NationFlag uid={official.nationUid} size={{ width: 48, height: 32 }} />
      }
      name={official.name}
      fullName={null}
      meta={official.nation ?? undefined}
      vitals={[
        official.dateOfBirth ? (
          <Born dateOfBirth={official.dateOfBirth} age={official.age} />
        ) : (
          age
        ),
        `${profileText.uid} ${official.uid}`,
      ]}
      currentAbility={official.currentAbility}
      potentialAbility={official.potentialAbility}
      loaded={{ details: official }}
      onClose={onClose}
      editing={editing}
    >
      <dl className="stats">
        <Fact label={text.reputation}>
          <EditableValue field="reputation">
            <ReputationMeter value={official.reputation} />
          </EditableValue>
        </Fact>
      </dl>
    </ProfileFrame>
  );
}
