import { useId, useState } from "react";
import { ClubProfile, readTab, type ClubTab } from "./ClubProfile";
import { clubListText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import { ReputationMeter } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import type { ClubFilter, ClubSummary } from "./types";

const columns = clubListText.columns;
const filters = clubListText.filters;

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
export function ClubBrowser({ version, active }: { version: number; active: boolean }) {
  // It starts as it was before the language was switched, if it was (see `restore.ts`).
  const [kind, setKind] = useState<ClubKind>(() => restored("clubKind", readKind));
  const [minReputation, setMinReputation] = useState(() => restored("clubMinRep", readText));
  const [maxReputation, setMaxReputation] = useState(() => restored("clubMaxRep", readText));
  const [foundedFrom, setFoundedFrom] = useState(() => restored("clubFoundedFrom", readText));
  const [foundedTo, setFoundedTo] = useState(() => restored("clubFoundedTo", readText));
  useSnapshot("clubKind", () => kind);
  useSnapshot("clubMinRep", () => minReputation);
  useSnapshot("clubMaxRep", () => maxReputation);
  useSnapshot("clubFoundedFrom", () => foundedFrom);
  useSnapshot("clubFoundedTo", () => foundedTo);
  // The tab of the club profile is kept here, so that the next club picked opens on the squad when this one did.
  const [tab, setTab] = useState<ClubTab>(() => restored("clubTab", readTab));
  useSnapshot("clubTab", () => tab);
  const minRep = whole(minReputation, REPUTATION_RANGE);
  const maxRep = whole(maxReputation, REPUTATION_RANGE);
  const fromYear = whole(foundedFrom, YEAR_RANGE);
  const toYear = whole(foundedTo, YEAR_RANGE);
  const filter: ClubFilter | undefined =
    kind === "all" && minRep === undefined && maxRep === undefined && fromYear === undefined && toYear === undefined
      ? undefined
      : {
          women: kind === "all" ? undefined : kind === "women",
          minReputation: minRep,
          maxReputation: maxRep,
          foundedFrom: fromYear,
          foundedTo: toYear,
        };
  const reputationLabel = useId();
  const foundedLabel = useId();

  return (
    <ListBrowser<ClubSummary>
      name="clubs"
      command="search_clubs"
      requestArgs={{ filter }}
      version={version}
      active={active}
      placeholder={clubListText.search}
      summary={clubListText.summary}
      empty={(query) => clubListText.empty(query, filter !== undefined)}
      filterBar={
        <div className="filter-bar">
          <div className="filter-fields">
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
          </div>
        </div>
      }
      toolbarActions={(list) => <MassEditButton entity="club" filters={{ clubFilter: filter }} list={list} />}
      tableClass="club-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="num col-rep">{columns.reputation}</th>
          <th className="num col-founded">{columns.founded}</th>
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
      <td className="num col-rep">
        <ReputationMeter value={c.reputation} />
      </td>
      {/* A year, so it is printed as it is: no thousands separator. */}
      <td className="num date col-founded">{c.founded ?? profileText.none}</td>
      <td className="num uid col-uid">{c.uid}</td>
    </>
  );
}
