import { useState } from "react";
import { ClubProfile } from "./ClubProfile";
import { clubListText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import { ReputationMeter } from "./ProfileParts";
import type { ClubFilter, ClubSummary } from "./types";

const columns = clubListText.columns;
const filters = clubListText.filters;

/** Which clubs the list shows. */
type ClubKind = "all" | "men" | "women";

/** The clubs table with the profile of the selected club beside it. */
export function ClubBrowser({ version, active }: { version: number; active: boolean }) {
  const [kind, setKind] = useState<ClubKind>("all");
  const filter: ClubFilter | undefined = kind === "all" ? undefined : { women: kind === "women" };

  return (
    <ListBrowser<ClubSummary>
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
            <select aria-label={filters.kind} value={kind} onChange={(e) => setKind(e.currentTarget.value as ClubKind)}>
              <option value="all">{filters.all}</option>
              <option value="men">{filters.men}</option>
              <option value="women">{filters.women}</option>
            </select>
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
      profile={(c, panel) => <ClubProfile club={c} version={panel.version} onClose={panel.onClose} />}
    />
  );
}

function ClubCells({ club: c }: { club: ClubSummary }) {
  return (
    <>
      <td className="col-name">
        <WithPicture picture={<ClubLogo uid={c.uid} name={c.name} size={PICTURE_SIZE.clubRowLogo} />}>
          <div className="name">
            {c.name}
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
