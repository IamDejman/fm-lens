import { ClubProfile } from "./ClubProfile";
import { clubListText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { ReputationMeter } from "./ProfileParts";
import type { ClubSummary } from "./types";

const columns = clubListText.columns;

/** The clubs table with the profile of the selected club beside it. */
export function ClubBrowser({ version, active }: { version: number; active: boolean }) {
  return (
    <ListBrowser<ClubSummary>
      command="search_clubs"
      version={version}
      active={active}
      placeholder={clubListText.search}
      summary={clubListText.summary}
      empty={clubListText.empty}
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
      profile={(c, panel) => <ClubProfile club={c} version={panel.version} onClose={panel.onClose} />}
    />
  );
}

function ClubCells({ club: c }: { club: ClubSummary }) {
  return (
    <>
      <td className="col-name">
        <div className="name">
          {c.name}
          {c.women && <span className="tag women">{clubListText.women}</span>}
        </div>
        {c.shortName && c.shortName !== c.name && <div className="sub">{c.shortName}</div>}
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
