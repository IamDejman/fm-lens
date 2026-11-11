// The Staff tab of a club's profile: everyone whose contract is with one of its teams, a team at a time, with the
// Squad tab's switch between the teams. The manager and the coaches come first, then recruitment, the medical staff
// and the board, the best of each job first. A row opens the member of staff in the staff list.

import { useContext, useMemo, useState } from "react";
import { Ability } from "./Ability";
import { clubProfileText as text, jobLabel, profileText, staffListText, teamLabel, type TeamId } from "./labels";
import { NationFlag, WithPicture } from "./Picture";
import { useProfileDetails, type PanelIds } from "./ProfileParts";
import { TeamSwitch } from "./SquadTab";
import { HumanBadge } from "./StaffProfile";
import type { StaffSummary } from "./types";
import { EditorContext } from "./useProfileEditing";

const columns = staffListText.columns;

/** FM's job codes in the order the tab lists them (see `jobs` in i18n); a player-coach goes with the job before. */
const JOB_ORDER: readonly number[] = [
  16, 20, 2, 34, 26, 22, 64, 10, 88, 44, 14, 58, 62, 60, 86, 38, 46, 50, 12, 40, 48, 66, 70, 4, 8, 24, 6,
];

/** Where a job comes in `JOB_ORDER`; no job, or one it does not know, comes last. */
function jobRank(job: number | null): number {
  const at = job === null ? -1 : JOB_ORDER.indexOf(job > 1 && job % 2 === 1 ? job - 1 : job);
  return at < 0 ? JOB_ORDER.length : at;
}

/** The staff in the tab's order: by job, then the best first, then by name. */
export function staffInOrder(staff: readonly StaffSummary[]): StaffSummary[] {
  return [...staff].sort(
    (a, b) => jobRank(a.job) - jobRank(b.job) || b.currentAbility - a.currentAbility || a.name.localeCompare(b.name),
  );
}

const SENIOR_TEAM: TeamId = { index: 0 };

/** The team a member of staff works for; one whose team the game does not name goes with the senior team. */
function teamOf(member: StaffSummary): TeamId {
  return member.team ?? SENIOR_TEAM;
}

/** The teams the staff work for, in the club's order: the senior team first. */
function staffTeams(staff: readonly StaffSummary[]): TeamId[] {
  const teams = new Map<number, TeamId>();
  for (const member of staff) {
    const team = teamOf(member);
    if (!teams.has(team.index)) {
      teams.set(team.index, team);
    }
  }
  return [...teams.values()].sort((a, b) => a.index - b.index);
}

interface ClubStaffTabProps {
  clubUid: number;
  /** For the table's name. */
  clubName: string;
  /** Changes when the game data is read again, so the staff are too. */
  version: number;
  panel: PanelIds;
}

export function ClubStaffTab({ clubUid, clubName, version, panel }: ClubStaffTabProps) {
  const loaded = useProfileDetails<StaffSummary[]>("club_staff", clubUid, version);
  const details = loaded?.details;
  const teams = useMemo(() => details && staffTeams(details), [details]);
  const [teamIndex, setTeamIndex] = useState(0);
  const team = teams?.find((candidate) => candidate.index === teamIndex) ?? teams?.[0];
  const shown = team?.index;
  const staff = useMemo(
    () => details && staffInOrder(details.filter((member) => teamOf(member).index === shown)),
    [details, shown],
  );

  return (
    <div
      className="squad-tab"
      role="tabpanel"
      id={panel.id}
      aria-labelledby={panel.labelledBy}
      aria-busy={loaded === null || undefined}
    >
      {loaded === null && (
        <p className="profile-status" role="status">
          {text.staffLoading}
        </p>
      )}
      {loaded?.error !== undefined && (
        <div className="banner" role="alert">
          {loaded.error}
        </div>
      )}
      {details?.length === 0 && <p className="empty">{text.noStaff}</p>}
      {teams !== undefined && team !== undefined && (
        <div className="squad-summary">
          <TeamSwitch teams={teams} team={team.index} onTeam={setTeamIndex} />
        </div>
      )}
      {team !== undefined && staff !== undefined && staff.length > 0 && (
        <div className="squad-table-wrap">
          <table className="grid squad-grid" aria-label={text.staffTableLabel(clubName, teamLabel(team))}>
            <thead>
              <tr>
                <th className="col-name">{columns.name}</th>
                <th>{columns.job}</th>
                <th className="num">{columns.age}</th>
                <th>{columns.nation}</th>
                <th className="num">{columns.currentAbility}</th>
                <th className="num">{columns.potentialAbility}</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => (
                <StaffRow key={member.uid} member={member} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One member of staff. A click on the row opens them in the staff list, and so does the name, which the keyboard reaches. */
function StaffRow({ member }: { member: StaffSummary }) {
  const { openStaff } = useContext(EditorContext);
  const fullName = member.fullName !== null && member.fullName !== member.name ? member.fullName : null;
  return (
    <tr onClick={() => openStaff(member.uid)}>
      <td className="col-name" title={fullName === null ? member.name : `${member.name}\n${fullName}`}>
        <div className="squad-name">
          <button type="button" className="name">
            {member.name}
          </button>
          {member.isHuman && <HumanBadge />}
        </div>
      </td>
      <td>{jobLabel(member.job)}</td>
      <td className="num">{member.age ?? profileText.none}</td>
      <td>
        <WithPicture picture={<NationFlag uid={member.nationUid} />}>{member.nation ?? profileText.none}</WithPicture>
      </td>
      <td className="num">
        <Ability value={member.currentAbility} />
      </td>
      <td className="num">
        <Ability value={member.potentialAbility} />
      </td>
    </tr>
  );
}
