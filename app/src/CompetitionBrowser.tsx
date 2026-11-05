import { formatNumber } from "./format";
import { competitionListText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { NationFlag, WithPicture } from "./Picture";
import { Fact, ProfileFrame } from "./ProfileParts";
import type { CompetitionSummary } from "./types";

const text = competitionListText;
const columns = text.columns;

/** The competitions, highest reputation first, with the selected one beside the table. */
export function CompetitionBrowser({ version, active }: { version: number; active: boolean }) {
  return (
    <ListBrowser<CompetitionSummary>
      name="competitions"
      command="search_competitions"
      version={version}
      active={active}
      placeholder={text.search}
      summary={text.summary}
      empty={(query) => text.empty(query)}
      tableClass="competition-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="col-nation">{columns.nation}</th>
          <th className="col-continent">{columns.continent}</th>
          <th className="num col-rep">{columns.reputation}</th>
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(competition) => <CompetitionCells competition={competition} />}
      profile={(competition, panel) => <CompetitionProfile competition={competition} onClose={panel.onClose} />}
    />
  );
}

function CompetitionCells({ competition }: { competition: CompetitionSummary }) {
  return (
    <>
      <td className="col-name" title={competition.name}>
        <span className="name">
          <span className="name-text">{competition.name}</span>
          {competition.women && <span className="tag women">{text.women}</span>}
        </span>
      </td>
      <td className="col-nation" title={competition.nation ?? undefined}>
        {competition.nation === null ? (
          profileText.none
        ) : (
          <WithPicture picture={<NationFlag uid={competition.nationUid} />}>{competition.nation}</WithPicture>
        )}
      </td>
      <td className="col-continent">{competition.continent ?? profileText.none}</td>
      <td className="num col-rep">{formatNumber(competition.reputation)}</td>
      <td className="num uid col-uid">{competition.uid}</td>
    </>
  );
}

/** A competition's profile: where it is played and its reputation. */
function CompetitionProfile({ competition, onClose }: { competition: CompetitionSummary; onClose: () => void }) {
  const flag = { width: 48, height: 32 };
  return (
    <ProfileFrame
      picture={competition.nationUid === null ? undefined : <NationFlag uid={competition.nationUid} size={flag} />}
      name={competition.name}
      fullName={competition.shortName !== competition.name ? competition.shortName : null}
      badge={competition.women ? <span className="tag women">{text.women}</span> : undefined}
      meta={[competition.nation, competition.continent].filter(Boolean).join(", ") || undefined}
      vitals={[`${profileText.uid} ${competition.uid}`]}
      loaded={{ details: competition }}
      onClose={onClose}
    >
      <dl className="stats">
        <Fact label={text.reputation}>{formatNumber(competition.reputation)}</Fact>
      </dl>
    </ProfileFrame>
  );
}
