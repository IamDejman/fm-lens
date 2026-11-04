import { NationFlag, WithPicture } from "./Picture";
import { Fact, ProfileFrame } from "./ProfileParts";
import { ListBrowser } from "./ListBrowser";
import { formatNumber } from "./format";
import { nationListText, profileText } from "./labels";
import type { NationSummary } from "./types";

const columns = nationListText.columns;

/** The nations of the players and staff in the save, with the selected nation beside the table. */
export function NationBrowser({ version, active }: { version: number; active: boolean }) {
  return (
    <ListBrowser<NationSummary>
      name="nations"
      command="search_nations"
      version={version}
      active={active}
      placeholder={nationListText.search}
      summary={nationListText.summary}
      empty={(query) => nationListText.empty(query)}
      tableClass="nation-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(nation) => <NationCells nation={nation} />}
      profile={(nation, panel) => <NationProfile nation={nation} onClose={panel.onClose} />}
    />
  );
}

function NationCells({ nation }: { nation: NationSummary }) {
  return (
    <>
      <td className="col-name">
        <WithPicture picture={<NationFlag uid={nation.nationUid} />}>{nation.name}</WithPicture>
      </td>
      <td className="num uid col-uid">{nation.nationUid === null ? profileText.none : formatNumber(nation.nationUid)}</td>
    </>
  );
}

function NationProfile({ nation, onClose }: { nation: NationSummary; onClose: () => void }) {
  return (
    <ProfileFrame
      picture={<NationFlag uid={nation.nationUid} size={{ width: 48, height: 32 }} />}
      name={nation.name}
      fullName={null}
      vitals={[]}
      loaded={{ details: nation }}
      onClose={onClose}
    >
      <p className="note">{nationListText.note}</p>
      <dl className="stats">
        <Fact label={nationListText.uid}>
          {nation.nationUid === null ? nationListText.noUid : formatNumber(nation.nationUid)}
        </Fact>
      </dl>
    </ProfileFrame>
  );
}
