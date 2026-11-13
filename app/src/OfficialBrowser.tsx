import { useState } from "react";
import { Ability } from "./Ability";
import { EditableValue } from "./EditControls";
import { chipLabel, FilterBar, type FilterChip, RangeField, rangeText, readText, whole } from "./FilterBar";
import { formatNumber } from "./format";
import { clubListText, officialListText, playerListText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { NationFlag, WithPicture } from "./Picture";
import { Born, Fact, ProfileFrame, ReputationMeter } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import { SavedFilterControls } from "./SavedFilterControls";
import { readPlain, savedKind } from "./savedFilters";
import { SortHeader, useListSort, type SortStart } from "./SortHeader";
import type { ListOrder, OfficialFilter, OfficialSort, OfficialSummary } from "./types";
import { useProfileEditing } from "./useProfileEditing";

const text = officialListText;
const columns = text.columns;
const filters = text.filters;
const AGE_RANGE = { min: 0, max: 99 };
const ABILITY_RANGE = { min: 1, max: 200 };
const REPUTATION_RANGE = { min: 0, max: 10000 };
/** The words every list's ability and reputation ranges share. */
const shared = playerListText.filters;
const reputationText = clubListText.filters;

/** The columns the list sorts by. Until one is clicked the search answers with the best first. */
const SORT: SortStart<OfficialSort> = {
  sorts: ["name", "age", "nation", "reputation", "currentAbility", "potentialAbility"],
  start: { by: "currentAbility", ascending: false },
  firstAscending: ["name", "nation"],
};

/** The inputs of the filter bar, empty: what a saved filter holds. */
const NO_FIELDS = {
  minAge: "",
  maxAge: "",
  minCurrentAbility: "",
  maxCurrentAbility: "",
  minPotentialAbility: "",
  maxPotentialAbility: "",
  minReputation: "",
  maxReputation: "",
  nation: "",
};
type OfficialFields = typeof NO_FIELDS;

const SAVED = savedKind<OfficialFields, OfficialSort>("officials", (value) => readPlain(value, NO_FIELDS), SORT.sorts);

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
  const [maxCurrentAbility, setMaxCurrentAbility] = useState(() => restored("officialMaxCa", readText));
  const [minPotentialAbility, setMinPotentialAbility] = useState(() => restored("officialMinPa", readText));
  const [maxPotentialAbility, setMaxPotentialAbility] = useState(() => restored("officialMaxPa", readText));
  const [minReputation, setMinReputation] = useState(() => restored("officialMinRep", readText));
  const [maxReputation, setMaxReputation] = useState(() => restored("officialMaxRep", readText));
  const [nation, setNation] = useState(() => restored("officialNation", readText));
  useSnapshot("officialMinAge", () => minAge);
  useSnapshot("officialMaxAge", () => maxAge);
  useSnapshot("officialMinCa", () => minCurrentAbility);
  useSnapshot("officialMaxCa", () => maxCurrentAbility);
  useSnapshot("officialMinPa", () => minPotentialAbility);
  useSnapshot("officialMaxPa", () => maxPotentialAbility);
  useSnapshot("officialMinRep", () => minReputation);
  useSnapshot("officialMaxRep", () => maxReputation);
  useSnapshot("officialNation", () => nation);
  const sort = useListSort("officialOrder", SORT);
  // What a saved filter keeps of the bar, and how one is brought back.
  const fields: OfficialFields = { minAge, maxAge, minCurrentAbility, maxCurrentAbility, minPotentialAbility, maxPotentialAbility, minReputation, maxReputation, nation };
  const applySaved = (saved: OfficialFields, order: ListOrder<OfficialSort> | null) => {
    setMinAge(saved.minAge);
    setMaxAge(saved.maxAge);
    setMinCurrentAbility(saved.minCurrentAbility);
    setMaxCurrentAbility(saved.maxCurrentAbility);
    setMinPotentialAbility(saved.minPotentialAbility);
    setMaxPotentialAbility(saved.maxPotentialAbility);
    setMinReputation(saved.minReputation);
    setMaxReputation(saved.maxReputation);
    setNation(saved.nation);
    sort.set(order);
  };
  const minAgeValue = whole(minAge, AGE_RANGE);
  const maxAgeValue = whole(maxAge, AGE_RANGE);
  const minCa = whole(minCurrentAbility, ABILITY_RANGE);
  const maxCa = whole(maxCurrentAbility, ABILITY_RANGE);
  const minPa = whole(minPotentialAbility, ABILITY_RANGE);
  const maxPa = whole(maxPotentialAbility, ABILITY_RANGE);
  const minRep = whole(minReputation, REPUTATION_RANGE);
  const maxRep = whole(maxReputation, REPUTATION_RANGE);
  const nationValue = nation.trim() || undefined;
  const values = [minAgeValue, maxAgeValue, minCa, maxCa, minPa, maxPa, minRep, maxRep, nationValue];
  const filter: OfficialFilter | undefined = values.every((value) => value === undefined)
    ? undefined
    : {
        minAge: minAgeValue,
        maxAge: maxAgeValue,
        minCurrentAbility: minCa,
        maxCurrentAbility: maxCa,
        minPotentialAbility: minPa,
        maxPotentialAbility: maxPa,
        minReputation: minRep,
        maxReputation: maxRep,
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
  const ability = rangeText(minCa, maxCa);
  const potential = rangeText(minPa, maxPa);
  const reputation = rangeText(minRep, maxRep, formatNumber);
  if (ability !== null) {
    add("ability", chipLabel(columns.ca, ability), () => {
      setMinCurrentAbility("");
      setMaxCurrentAbility("");
    });
  }
  if (potential !== null) {
    add("potential", chipLabel(columns.pa, potential), () => {
      setMinPotentialAbility("");
      setMaxPotentialAbility("");
    });
  }
  if (reputation !== null) {
    add("reputation", chipLabel(columns.reputation, reputation), () => {
      setMinReputation("");
      setMaxReputation("");
    });
  }
  if (nationValue !== undefined) {
    add("nation", chipLabel(filters.nation, nationValue), () => setNation(""));
  }
  const clearAll = () => {
    setMinAge("");
    setMaxAge("");
    setMinCurrentAbility("");
    setMaxCurrentAbility("");
    setMinPotentialAbility("");
    setMaxPotentialAbility("");
    setMinReputation("");
    setMaxReputation("");
    setNation("");
  };

  return (
    <ListBrowser<OfficialSummary>
      name="officials"
      command="search_officials"
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
          <RangeField
            label={columns.ca}
            minLabel={shared.minCurrentAbilityTitle}
            maxLabel={shared.maxCurrentAbilityTitle}
            range={ABILITY_RANGE}
            min={minCurrentAbility}
            max={maxCurrentAbility}
            onMin={setMinCurrentAbility}
            onMax={setMaxCurrentAbility}
          />
          <RangeField
            label={columns.pa}
            minLabel={shared.minPotentialAbilityTitle}
            maxLabel={shared.maxPotentialAbilityTitle}
            range={ABILITY_RANGE}
            min={minPotentialAbility}
            max={maxPotentialAbility}
            onMin={setMinPotentialAbility}
            onMax={setMaxPotentialAbility}
          />
          <RangeField
            label={columns.reputation}
            minLabel={reputationText.minReputation}
            maxLabel={reputationText.maxReputation}
            range={REPUTATION_RANGE}
            min={minReputation}
            max={maxReputation}
            onMin={setMinReputation}
            onMax={setMaxReputation}
          />
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
          <SortHeader by="name" sort={sort} label={columns.name} className="col-name" />
          <SortHeader by="age" sort={sort} label={columns.age} className="num col-age" />
          <SortHeader by="nation" sort={sort} label={columns.nation} className="col-nation" />
          <SortHeader by="reputation" sort={sort} label={columns.reputation} className="num col-rep" />
          <SortHeader
            by="currentAbility"
            sort={sort}
            label={columns.ca}
            name={playerListText.sortNames.currentAbility}
            className="num col-ca"
          />
          <SortHeader
            by="potentialAbility"
            sort={sort}
            label={columns.pa}
            name={playerListText.sortNames.potentialAbility}
            className="num col-pa"
          />
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
