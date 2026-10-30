import { Ability } from "./Ability";
import { formatDate } from "./format";
import { ListBrowser } from "./ListBrowser";
import { PlayerProfile } from "./PlayerProfile";
import type { PlayerSummary } from "./types";

/** The players table with the profile of the selected player beside it. */
export function PlayerBrowser({ version, active }: { version: number; active: boolean }) {
  return (
    <ListBrowser<PlayerSummary>
      command="search_players"
      version={version}
      active={active}
      placeholder="Search players by name or UID"
      summary={(total, shown) =>
        total > shown
          ? `${total.toLocaleString()} players · showing the top ${shown} by current ability`
          : `${total.toLocaleString()} players`
      }
      empty={(query) => `No players match “${query}”.`}
      header={
        <>
          <th>Name</th>
          <th className="num">Age</th>
          <th className="col-nation">Nation</th>
          <th>Club</th>
          <th className="col-born">Born</th>
          <th className="num">CA</th>
          <th className="num">PA</th>
          <th className="num col-uid">UID</th>
        </>
      }
      cells={(p) => (
        <>
          <td>
            <div className="name">{p.name}</div>
            {p.fullName && p.fullName !== p.name && <div className="sub">{p.fullName}</div>}
          </td>
          <td className="num">{p.age ?? "—"}</td>
          <td className="col-nation">{p.nation ?? "—"}</td>
          <td>{p.club ?? <span className="muted">Free agent</span>}</td>
          <td className="date col-born">{formatDate(p.dateOfBirth)}</td>
          <td className="num">
            <Ability value={p.currentAbility} />
          </td>
          <td className="num">
            <Ability value={p.potentialAbility} />
          </td>
          <td className="num uid col-uid">{p.uid}</td>
        </>
      )}
      profile={(p, panel) => <PlayerProfile player={p} version={panel.version} onClose={panel.onClose} />}
    />
  );
}
