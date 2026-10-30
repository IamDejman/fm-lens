import { Ability } from "./Ability";
import { formatDate } from "./format";
import { jobLabel, profileText, staffListText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { employerOf, HumanBadge, StaffProfile } from "./StaffProfile";
import type { StaffSummary } from "./types";

const columns = staffListText.columns;

/** The staff table with the profile of the selected member of staff beside it. */
export function StaffBrowser({ version, active }: { version: number; active: boolean }) {
  return (
    <ListBrowser<StaffSummary>
      command="search_staff"
      version={version}
      active={active}
      placeholder={staffListText.search}
      summary={staffListText.summary}
      empty={staffListText.empty}
      tableClass="staff-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="num col-age">{columns.age}</th>
          <th className="col-job">{columns.job}</th>
          <th className="col-club">{columns.club}</th>
          <th className="col-nation">{columns.nation}</th>
          <th className="col-born">{columns.born}</th>
          <th className="num col-ca">{columns.currentAbility}</th>
          <th className="num col-pa">{columns.potentialAbility}</th>
          <th className="num col-uid">{columns.id}</th>
        </>
      }
      cells={(s) => <StaffCells staff={s} />}
      profile={(s, panel) => <StaffProfile member={s} version={panel.version} onClose={panel.onClose} />}
    />
  );
}

function StaffCells({ staff: s }: { staff: StaffSummary }) {
  return (
    <>
      <td className="col-name">
        <div className="name">
          {s.name}
          {s.isHuman && <HumanBadge />}
        </div>
        {s.fullName && s.fullName !== s.name && <div className="sub">{s.fullName}</div>}
      </td>
      <td className="num col-age">{s.age ?? profileText.none}</td>
      {/* A long job or club is cut short with an ellipsis (see App.css); the hover text has all of it. */}
      <td className="col-job" title={s.job === null ? undefined : jobLabel(s.job)}>
        {jobLabel(s.job)}
      </td>
      <td className="col-club" title={s.club ?? undefined}>
        {employerOf(s) ?? <span className="muted">{profileText.none}</span>}
      </td>
      <td className="col-nation">{s.nation ?? profileText.none}</td>
      <td className="date col-born">{formatDate(s.dateOfBirth)}</td>
      <td className="num col-ca">
        <Ability value={s.currentAbility} />
      </td>
      <td className="num col-pa">
        <Ability value={s.potentialAbility} />
      </td>
      <td className="num uid col-uid">{s.uid}</td>
    </>
  );
}
