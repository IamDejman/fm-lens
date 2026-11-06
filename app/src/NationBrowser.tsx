import { EditableValue } from "./EditControls";
import { formatNumber, formatPercent } from "./format";
import { NationFlag, WithPicture } from "./Picture";
import {
  Fact,
  ProfileFrame,
  ReputationMeter,
  useProfileDetails,
} from "./ProfileParts";
import { ListBrowser } from "./ListBrowser";
import { nationListText, profileText } from "./labels";
import { useProfileEditing } from "./useProfileEditing";
import type {
  NamedPerson,
  NationDetails,
  NationalTeam,
  NationSummary,
  WomenFootball,
} from "./types";

const text = nationListText;
const columns = text.columns;

/** The nations of the players and staff in the save, with the selected nation beside the table. */
export function NationBrowser({
  version,
  active,
}: {
  version: number;
  active: boolean;
}) {
  return (
    <ListBrowser<NationSummary>
      name="nations"
      command="search_nations"
      version={version}
      active={active}
      placeholder={text.search}
      summary={text.summary}
      empty={(query) => text.empty(query)}
      tableClass="nation-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(nation) => <NationCells nation={nation} />}
      profile={(nation, panel) => (
        <NationProfile
          key={nation.uid}
          nation={nation}
          version={version}
          onClose={panel.onClose}
        />
      )}
    />
  );
}

function NationCells({ nation }: { nation: NationSummary }) {
  return (
    <>
      <td className="col-name">
        <WithPicture picture={<NationFlag uid={nation.nationUid} />}>
          {nation.name}
        </WithPicture>
      </td>
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
 * A nation's rules, FIFA standing, rivals and national teams, men's and women's; only its ID where the build does not
 * place them. Its rules, youth ratings and senior teams' reputations can be edited where the row is the nation's own
 * UID.
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
      {loaded?.details === null && <p className="note">{text.note}</p>}
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

/** A nation's women's football: when it joined FIFA and its confederation, its youth rating, and its teams. */
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
          <Fact label={text.joinedFifa}>{orDash(women.joinedFifa)}</Fact>
          <Fact label={text.joinedContinental}>
            {orDash(women.joinedContinental)}
          </Fact>
        </dl>
      </section>
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
