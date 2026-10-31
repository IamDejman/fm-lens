import { useState } from "react";
import { Ability } from "./Ability";
import { formatDate } from "./format";
import { JOB_FILTER_OPTIONS, jobLabel, profileText, staffListText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { ClubLogo, NationFlag, PICTURE_SIZE, WithPicture } from "./Picture";
import { employerOf, HumanBadge, StaffProfile } from "./StaffProfile";
import type { StaffFilter, StaffSummary } from "./types";

const columns = staffListText.columns;
const filters = staffListText.filters;

/** The staff table with the profile of the selected member of staff beside it. */
export function StaffBrowser({ version, active }: { version: number; active: boolean }) {
  // The job as the select holds it: a job code, or "" for any.
  const [job, setJob] = useState("");
  const [unemployed, setUnemployed] = useState(false);
  const filter: StaffFilter | undefined =
    job === "" && !unemployed
      ? undefined
      : { job: job === "" ? undefined : Number(job), unemployed: unemployed || undefined };

  return (
    <ListBrowser<StaffSummary>
      command="search_staff"
      requestArgs={{ filter }}
      version={version}
      active={active}
      placeholder={staffListText.search}
      summary={staffListText.summary}
      empty={(query) => staffListText.empty(query, filter !== undefined)}
      filterBar={
        <div className="filter-bar">
          <div className="filter-fields">
            <label className="filter-field">
              <span>{filters.job}</span>
              <select value={job} onChange={(e) => setJob(e.currentTarget.value)}>
                <option value="">{filters.anyJob}</option>
                {JOB_FILTER_OPTIONS.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <input type="checkbox" checked={unemployed} onChange={(e) => setUnemployed(e.currentTarget.checked)} />
              <span>{filters.unemployedOnly}</span>
            </label>
          </div>
        </div>
      }
      toolbarActions={(list) => <MassEditButton entity="staff" filters={{ staffFilter: filter }} list={list} />}
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
        <WithPicture picture={<ClubLogo uid={s.clubUid} name={s.club} size={PICTURE_SIZE.rowLogo} />}>
          {employerOf(s) ?? <span className="muted">{profileText.none}</span>}
        </WithPicture>
      </td>
      <td className="col-nation">
        <WithPicture picture={<NationFlag uid={s.nationUid} />}>{s.nation ?? profileText.none}</WithPicture>
      </td>
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
