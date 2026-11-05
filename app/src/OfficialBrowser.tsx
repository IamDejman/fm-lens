import { Ability } from "./Ability";
import { formatDate, formatNumber } from "./format";
import { officialListText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { NationFlag, WithPicture } from "./Picture";
import { Fact, ProfileFrame, ReputationMeter } from "./ProfileParts";
import type { OfficialSummary } from "./types";

const text = officialListText;
const columns = text.columns;

/** The match officials, best first, with the selected official beside the table. */
export function OfficialBrowser({
  version,
  active,
}: {
  version: number;
  active: boolean;
}) {
  return (
    <ListBrowser<OfficialSummary>
      name="officials"
      command="search_officials"
      version={version}
      active={active}
      placeholder={text.search}
      summary={text.summary}
      empty={(query) => text.empty(query)}
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

/** An official's profile: what the list reads, as facts. */
function OfficialProfile({
  official,
  onClose,
}: {
  official: OfficialSummary;
  onClose: () => void;
}) {
  const born = formatDate(official.dateOfBirth);
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
        born && `${text.born} ${born}`,
        age,
        `${profileText.uid} ${official.uid}`,
      ]}
      currentAbility={official.currentAbility}
      potentialAbility={official.potentialAbility}
      loaded={{ details: official }}
      onClose={onClose}
    >
      <dl className="stats">
        <Fact label={text.reputation}>
          <ReputationMeter value={official.reputation} />
        </Fact>
      </dl>
    </ProfileFrame>
  );
}
