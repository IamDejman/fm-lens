import { useEffect, useState } from "react";
import { call } from "./api";
import { EditableValue } from "./EditControls";
import { chipLabel, FilterBar, readText } from "./FilterBar";
import { formatNumber, formatPercent } from "./format";
import { NationFlag, WithPicture } from "./Picture";
import {
  Fact,
  ProfileFrame,
  RatingGroup,
  ReputationMeter,
  useProfileDetails,
} from "./ProfileParts";
import { ListBrowser } from "./ListBrowser";
import { NATION_STYLE_LABELS, nationListText, profileText } from "./labels";
import { restored, useSnapshot } from "./restore";
import { SortHeader, useListSort, type SortStart } from "./SortHeader";
import { useProfileEditing } from "./useProfileEditing";
import type {
  NamedPerson,
  NationDetails,
  NationalTeam,
  NationFilter,
  NationSort,
  NationSummary,
  WomenFootball,
} from "./types";

const text = nationListText;
const columns = text.columns;
const filters = text.filters;

/** The columns the list sorts by. Until one is clicked the search answers by name. */
const SORT: SortStart<NationSort> = {
  sorts: ["name", "continent"],
  start: { by: "name", ascending: true },
  firstAscending: ["name", "continent"],
};

/**
 * The nations of the players, staff and competitions in the save, with the selected nation beside the table where the
 * build places nations' details: elsewhere a profile would only repeat the row, so none opens. Their continents are
 * read, shown and filtered on only there too.
 */
export function NationBrowser({
  version,
  active,
}: {
  version: number;
  active: boolean;
}) {
  const detailed = useNationsDetailed(version, active);
  // The filter starts as it was before the language was switched, if it was (see `restore.ts`).
  const [continent, setContinent] = useState(() =>
    restored("nationContinent", readText),
  );
  useSnapshot("nationContinent", () => continent);
  const sort = useListSort("nationOrder", SORT);
  // The continent is a column only where the build reads it: a sort by it kept from elsewhere asks for nothing.
  const order = sort.order?.by === "continent" && !detailed ? undefined : (sort.order ?? undefined);
  const continentValue = (detailed && continent.trim()) || undefined;
  const filter: NationFilter | undefined =
    continentValue === undefined ? undefined : { continent: continentValue };
  const chips =
    continentValue === undefined
      ? []
      : [
          {
            key: "continent",
            label: chipLabel(filters.continent, continentValue),
            remove: () => setContinent(""),
          },
        ];
  return (
    <ListBrowser<NationSummary>
      name="nations"
      command="search_nations"
      requestArgs={{ filter, order }}
      version={version}
      active={active}
      placeholder={text.search}
      summary={text.summary}
      empty={(query) => text.empty(query, filter !== undefined)}
      filterBar={
        detailed ? (
          <FilterBar chips={chips} onClear={() => setContinent("")}>
            <label className="filter-field">
              <span>{filters.continent}</span>
              <input
                value={continent}
                onChange={(e) => setContinent(e.currentTarget.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </FilterBar>
        ) : undefined
      }
      tableClass="nation-grid"
      header={
        <>
          <SortHeader by="name" sort={sort} label={columns.name} className="col-name" />
          {detailed && <SortHeader by="continent" sort={sort} label={columns.continent} className="col-continent" />}
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(nation) => <NationCells nation={nation} continent={detailed} />}
      profile={
        detailed
          ? (nation, panel) => (
              <NationProfile
                key={nation.uid}
                nation={nation}
                version={version}
                onClose={panel.onClose}
              />
            )
          : undefined
      }
    />
  );
}

/** Whether this build places nations' details, asked again when the game is read again; no until it says so. */
function useNationsDetailed(version: number, active: boolean): boolean {
  const [detailed, setDetailed] = useState(false);
  useEffect(() => {
    if (!active) {
      return;
    }
    let current = true;
    call<boolean>("nations_detailed").then(
      (value) => current && setDetailed(value),
      () => current && setDetailed(false),
    );
    return () => {
      current = false;
    };
  }, [version, active]);
  return detailed;
}

function NationCells({
  nation,
  continent,
}: {
  nation: NationSummary;
  /** Whether the continent has a column. */
  continent: boolean;
}) {
  return (
    <>
      <td className="col-name">
        <WithPicture picture={<NationFlag uid={nation.nationUid} />}>
          {nation.name}
        </WithPicture>
      </td>
      {continent && (
        <td className="col-continent">
          {nation.continent ?? profileText.none}
        </td>
      )}
      <td className="num uid col-uid">
        {nation.nationUid === null ? profileText.none : nation.nationUid}
      </td>
    </>
  );
}

interface NationProfileProps {
  nation: NationSummary;
  version: number;
  onClose: () => void;
}

/**
 * A nation's rules, FIFA standings, rivals and national teams, men's and women's. Its rules, FIFA points, youth
 * ratings, game importance, attendance, style and senior teams' reputations can be edited where the row is the
 * nation's own UID.
 */
function NationProfile({ nation, version, onClose }: NationProfileProps) {
  const loaded = useProfileDetails<NationDetails | null>(
    "nation_details",
    nation.uid,
    version,
  );
  const details = loaded?.details ?? null;
  const editing = useProfileEditing(
    "nation",
    nation.uid,
    nation.nationUid === nation.uid && loaded?.details !== null,
  );
  const id =
    nation.nationUid === null ? text.noUid : `${text.uid} ${nation.nationUid}`;
  return (
    <ProfileFrame
      picture={
        <NationFlag uid={nation.nationUid} size={{ width: 48, height: 32 }} />
      }
      name={nation.name}
      fullName={null}
      vitals={[details?.code, details?.continent, id]}
      loaded={loaded}
      onClose={onClose}
      editing={editing}
    >
      {details && <NationBody details={details} />}
    </ProfileFrame>
  );
}

const TWO_DECIMALS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

const orDash = (value: string | number | null) =>
  value === null ? profileText.none : value;

function NationBody({ details }: { details: NationDetails }) {
  const dual =
    details.dualNationality === null
      ? null
      : details.dualNationality
        ? text.allowed
        : text.notAllowed;
  const years = details.naturalisationNever
    ? text.never
    : details.naturalisationYears;
  return (
    <div className="profile-split">
      <div className="profile-stack">
        <section className="profile-group">
          <h3>{text.nation}</h3>
          <dl className="stats">
            <Fact label={text.capital}>{orDash(details.capital)}</Fact>
            <Fact label={text.population}>
              <EditableValue field="population">
                {orDash(
                  details.population === null
                    ? null
                    : formatNumber(details.population),
                )}
              </EditableValue>
            </Fact>
            <Fact label={text.dualNationality}>
              <EditableValue field="dual_nationality">
                {orDash(dual)}
              </EditableValue>
            </Fact>
            <Fact label={text.naturalisation}>
              <EditableValue field="naturalisation">
                {orDash(years)}
              </EditableValue>
            </Fact>
            <Fact label={text.founded}>{orDash(details.founded)}</Fact>
            <Fact label={text.youthRating}>
              <EditableValue field="youth_rating">
                {orDash(details.youthRating)}
              </EditableValue>
            </Fact>
            <Fact label={text.gameImportance}>
              <EditableValue field="game_importance">
                {orDash(details.gameImportance)}
              </EditableValue>
            </Fact>
            <Fact label={text.attendance}>
              <EditableValue field="attendance">
                {orDash(details.attendance)}
              </EditableValue>
            </Fact>
          </dl>
        </section>
        {details.languages.length > 0 && (
          <section className="profile-group">
            <h3>{text.languages}</h3>
            <dl className="stats">
              {details.languages.map((language, index) => (
                <Fact key={index} label={language.name ?? profileText.none}>
                  {formatPercent(language.percent)}
                </Fact>
              ))}
            </dl>
          </section>
        )}
        <section className="profile-group">
          <h3>{text.fifa}</h3>
          <dl className="stats">
            <Fact label={text.ranking}>{orDash(details.ranking)}</Fact>
            <Fact label={text.points}>
              <EditableValue field="points">
                {orDash(
                  details.points === null
                    ? null
                    : formatNumber(details.points, TWO_DECIMALS),
                )}
              </EditableValue>
            </Fact>
            <Fact label={text.joinedFifa}>{orDash(details.joinedFifa)}</Fact>
            <Fact label={text.joinedContinental}>
              {orDash(details.joinedContinental)}
            </Fact>
          </dl>
        </section>
        <StyleGroup title={text.style} style={details.style} side="" />
        {details.rivals.length > 0 && (
          <section className="profile-group">
            <h3>{profileText.rivals}</h3>
            <dl className="stats">
              {details.rivals.map((rival) => (
                <Fact
                  key={rival.uid}
                  label={
                    <WithPicture
                      inline
                      picture={<NationFlag uid={rival.uid} />}
                    >
                      {rival.name ?? rival.uid}
                    </WithPicture>
                  }
                >
                  {orDash(rival.strength)}
                </Fact>
              ))}
            </dl>
          </section>
        )}
      </div>
      <div className="profile-stack">
        {details.teams.map((team) => (
          <TeamGroup
            key={team.kind}
            team={team}
            name={text.teamName(team.ageLimit)}
            field="reputation"
          />
        ))}
        {details.women && <WomenGroups women={details.women} />}
      </div>
    </div>
  );
}

const nameOf = (person: NamedPerson | null) => person?.name ?? profileText.none;

/** The kind of a senior national team (`NationalTeam.kind`). */
const SENIOR = 0;

/**
 * A nation's women's football: its FIFA standing, when it joined FIFA and its confederation, its youth rating, and
 * its teams.
 */
function WomenGroups({ women }: { women: WomenFootball }) {
  return (
    <>
      <section className="profile-group">
        <h3>{text.women}</h3>
        <dl className="stats">
          <Fact label={text.youthRating}>
            <EditableValue field="women.youth_rating">
              {orDash(women.youthRating)}
            </EditableValue>
          </Fact>
          <Fact label={text.gameImportance}>
            <EditableValue field="women.game_importance">
              {orDash(women.gameImportance)}
            </EditableValue>
          </Fact>
          <Fact label={text.attendance}>
            <EditableValue field="women.attendance">
              {orDash(women.attendance)}
            </EditableValue>
          </Fact>
          <Fact label={text.ranking}>{orDash(women.ranking)}</Fact>
          <Fact label={text.points}>
            <EditableValue field="women.points">
              {orDash(
                women.points === null
                  ? null
                  : formatNumber(women.points, TWO_DECIMALS),
              )}
            </EditableValue>
          </Fact>
          <Fact label={text.joinedFifa}>{orDash(women.joinedFifa)}</Fact>
          <Fact label={text.joinedContinental}>
            {orDash(women.joinedContinental)}
          </Fact>
        </dl>
      </section>
      <StyleGroup title={text.womenStyle} style={women.style} side="women." />
      {women.teams.map((team) => (
        <TeamGroup
          key={team.kind}
          team={team}
          name={text.womenTeamName(team.ageLimit)}
          field="women.reputation"
        />
      ))}
    </>
  );
}

/**
 * A side's style ratings, 0 to 20, in the order of their labels; inputs while the nation is edited. `side` is the
 * prefix of the fields' keys: "" for the men's, "women." for the women's.
 */
function StyleGroup({
  title,
  style,
  side,
}: {
  title: string;
  style: Record<string, number> | null;
  side: string;
}) {
  if (style === null) {
    return null;
  }
  const rows = Object.entries(NATION_STYLE_LABELS).map(([key, label]) => ({
    key,
    field: `${side}style.${key}`,
    label,
    value: style[key],
  }));
  return <RatingGroup title={title} rows={rows} hint />;
}

/**
 * One national team: who runs it, who leads it, and its squad. The senior team's reputation can be edited, as
 * `field`.
 */
function TeamGroup({
  team,
  name,
  field,
}: {
  team: NationalTeam;
  name: string;
  field: string;
}) {
  const meter = <ReputationMeter value={team.reputation} />;
  return (
    <section className="profile-group">
      <h3>{name}</h3>
      <dl className="stats">
        <Fact label={text.reputation}>
          {team.kind === SENIOR ? (
            <EditableValue field={field}>{meter}</EditableValue>
          ) : (
            meter
          )}
        </Fact>
        <Fact label={text.manager}>{nameOf(team.manager)}</Fact>
        <Fact label={text.captain}>{nameOf(team.captain)}</Fact>
        <Fact label={text.viceCaptain}>{nameOf(team.viceCaptain)}</Fact>
      </dl>
      {team.squad.length > 0 && (
        <details className="national-squad">
          <summary>{text.squad(team.squad.length)}</summary>
          <ul className="club-ties">
            {team.squad.map((player) => (
              <li key={player.uid}>{player.name}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
