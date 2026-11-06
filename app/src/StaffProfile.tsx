import { Fragment, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { EditableValue } from "./EditControls";
import { call } from "./api";
import { changeStaffJob, staffJobs } from "./editing";
import { describeError } from "./format";
import { editText, fieldLabel, jobLabel, profileText, STAFF_ATTRIBUTE_LABELS, type StaffAttributeKey } from "./labels";
import { MoveButton } from "./MoveDialog";
import { LanguagesGroup, PreferencesGroup } from "./RelationGroups";
import { ClubLogo, NationFlag, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import {
  attributeRow,
  Born,
  ContractDates,
  Fact,
  personalityRows,
  ProfileFrame,
  RatingGroup,
  ReputationBars,
  useProfileDetails,
  WageFact,
  type RatingRow,
} from "./ProfileParts";
import type { StaffContract, StaffDetails, StaffSummary } from "./types";
import { EditorContext, useProfileEditing } from "./useProfileEditing";

// Attributes in the order FM lists them, by group.
const COACHING: StaffAttributeKey[] = [
  "attacking", "defending", "fitness", "goalkeeping", "possession", "set_pieces", "tactical", "technical",
  "working_with_youngsters",
];
const MENTAL: StaffAttributeKey[] = ["authority", "determination", "motivating", "people_management"];
const KNOWLEDGE: StaffAttributeKey[] = [
  "data_analysis", "judging_ability", "judging_potential", "judging_staff", "negotiating", "tactical_knowledge",
];
const MEDICAL: StaffAttributeKey[] = ["physiotherapy", "sports_science"];

/** The game stores these two as shown (1–20); every other attribute is stored as 0–100. */
const STORED_AS_SHOWN = new Set<string>(["working_with_youngsters", "authority"]);

/** The "You" badge of the manager the user controls. */
export function HumanBadge() {
  return (
    <span className="tag you" title={profileText.youTitle}>
      {profileText.you}
    </span>
  );
}

/**
 * Where a member of staff works: the club, "Unemployed" when they have no job at all, and nothing
 * when they have a job at a team whose club is unknown.
 */
export function employerOf(member: StaffSummary): ReactNode {
  if (member.club !== null) {
    return member.club;
  }
  return member.job === null ? <span className="muted">{profileText.unemployed}</span> : null;
}

/** `employerOf` for a line of text: the club comes with its logo. */
function employerLine(member: StaffSummary): ReactNode {
  if (member.club === null) {
    return employerOf(member);
  }
  return (
    <WithPicture inline picture={<ClubLogo uid={member.clubUid} name={member.club} size={PICTURE_SIZE.textLogo} />}>
      {member.club}
    </WithPicture>
  );
}

/** The parts that are there, with a dot between them. */
function dotted(parts: ReactNode[]): ReactNode {
  return parts
    .filter((part) => part !== null && part !== undefined && part !== false && part !== "")
    .map((part, index) => (
      <Fragment key={index}>
        {index > 0 && " · "}
        {part}
      </Fragment>
    ));
}

interface StaffProfileProps {
  /** The row that was picked; its fields fill the header while the full profile loads. */
  member: StaffSummary;
  /** Changes when the game data is read again, so the profile is too. */
  version: number;
  onClose: () => void;
}

/** The profile of one member of staff. Mount it with `key={uid}` so a new person starts at the top. */
export function StaffProfile({ member, version, onClose }: StaffProfileProps) {
  const loaded = useProfileDetails<StaffDetails>("staff_details", member.uid, version);
  const editing = useProfileEditing("staff", member.uid);
  const details = loaded?.details;
  const info: StaffSummary = details ?? member;
  const vitals = [info.dateOfBirth && <Born dateOfBirth={info.dateOfBirth} age={info.age} />, `${profileText.id} ${info.uid}`];

  return (
    <ProfileFrame
      picture={<PersonFace uid={info.uid} name={info.name} size={PICTURE_SIZE.face} />}
      name={info.name}
      fullName={info.fullName}
      badge={info.isHuman ? <HumanBadge /> : undefined}
      meta={dotted([
        info.job !== null && jobLabel(info.job),
        employerLine(info),
        // An input where it is shown while the member of staff is edited, like the abilities.
        info.nation && (
          <EditableValue field="nation">
            <WithPicture inline picture={<NationFlag uid={info.nationUid} />}>
              {info.nation}
            </WithPicture>
          </EditableValue>
        ),
      ])}
      vitals={vitals}
      currentAbility={info.currentAbility}
      potentialAbility={info.potentialAbility}
      loaded={loaded}
      onClose={onClose}
      editing={editing}
      actions={
        // Only while the profile is read, not edited, and for someone with a club to leave who is not you.
        editing.editable &&
        editing.stage === "view" &&
        info.club !== null &&
        !info.isHuman && (
          <MoveButton
            kind="staff"
            player={{ uid: info.uid, name: info.name, club: info.club, clubUid: info.clubUid }}
            contract={null}
            ready={details !== undefined}
          />
        )
      }
    >
      {details && <StaffBody details={details} canChangeJob={editing.stage === "view" && !info.isHuman} />}
    </ProfileFrame>
  );
}

function StaffBody({ details, canChangeJob }: { details: StaffDetails; canChangeJob: boolean }) {
  const person = { uid: details.uid, staff: true, name: details.name };
  return (
    <>
      <StaffFreeze uid={details.uid} />
      {/* What only the user's own manager has comes first, where it is found. */}
      {details.isHuman && (details.unsackable !== null || details.registrationAnytime !== null) && (
        <ManagerGroup unsackable={details.unsackable} registrationAnytime={details.registrationAnytime} />
      )}
      <div className="profile-pair">
        <div className="profile-columns">
          <RatingGroup title={profileText.coaching} rows={attributeRows(details, COACHING)} />
          <div className="profile-stack">
            <RatingGroup title={profileText.mental} rows={attributeRows(details, MENTAL)} />
            <RatingGroup title={profileText.medical} rows={attributeRows(details, MEDICAL)} />
          </div>
          <RatingGroup title={profileText.knowledge} rows={attributeRows(details, KNOWLEDGE)} />
        </div>

        <div className="profile-split">
          <RatingGroup title={profileText.personality} rows={personalityRows(details.personality)} />
          <div className="profile-stack">
            {details.contract && (
              <ContractGroup uid={details.uid} contract={details.contract} canChangeJob={canChangeJob} />
            )}
            {details.coachingLicence !== null && (
              <section className="profile-group">
                <h3>{profileText.qualifications}</h3>
                <dl className="stats">
                  <Fact label={profileText.coachingLicence}>
                    <EditableValue field="coaching_licence">
                      {profileText.licenceName(details.coachingLicence)}
                    </EditableValue>
                  </Fact>
                </dl>
              </section>
            )}
            <section className="profile-group">
              <h3>{profileText.reputation}</h3>
              <ReputationBars reputation={details.reputation} />
            </section>
          </div>
        </div>
      </div>
      <LanguagesGroup languages={details.languages} person={person} />
      <PreferencesGroup preferences={details.preferences} person={person} />
    </>
  );
}

function StaffFreeze({ uid }: { uid: number }) {
  const { editable } = useContext(EditorContext);
  const [frozen, setFrozen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    call<number[]>("frozen_staff").then((staff) => { if (active) setFrozen(staff.includes(uid)); })
      .catch((err) => { if (active) setError(describeError(err)); });
    return () => { active = false; };
  }, [uid]);
  if (!editable) return null;
  return <div className="attribute-actions">
    <label className="freeze-toggle" title={profileText.freezeAttributesNote}><input type="checkbox" checked={frozen ?? false} disabled={busy || frozen === null}
      onChange={(e) => {
        const next = e.target.checked;
        setBusy(true); setError(null);
        void call<number[]>("freeze_staff_attributes", { uid, frozen: next })
          .then((staff) => setFrozen(staff.includes(uid)))
          .catch((err) => setError(describeError(err))).finally(() => setBusy(false));
      }} /> <span>{profileText.freezeAttributes}</span></label>
    {error && <p className="note error" role="alert">{error}</p>}
  </div>;
}

function attributeRows(details: StaffDetails, keys: StaffAttributeKey[]): RatingRow[] {
  return keys.map((key) =>
    attributeRow(key, STAFF_ATTRIBUTE_LABELS[key], details.attributes[key], {
      scale: STORED_AS_SHOWN.has(key) ? 20 : 100,
    }),
  );
}

interface ContractGroupProps {
  uid: number;
  contract: StaffContract;
  /** Whether the job may be changed now: the profile is read, not edited, and it is not yours. */
  canChangeJob: boolean;
}

/** The job code of a manager, whose label heads what only the user's own manager has. */
const MANAGER_JOB = 16;

interface ManagerGroupProps {
  unsackable: boolean | null;
  registrationAnytime: boolean | null;
}

/** What only the manager the user controls has, with or without a club: the game's own manager flags. */
function ManagerGroup({ unsackable, registrationAnytime }: ManagerGroupProps) {
  const flags: [string, boolean | null][] = [
    ["manager.unsackable", unsackable],
    ["manager.registration_anytime", registrationAnytime],
  ];
  return (
    <section className="profile-group">
      <h3>{jobLabel(MANAGER_JOB)}</h3>
      <dl className="stats">
        {flags.map(
          ([field, value]) =>
            value !== null && (
              <Fact key={field} label={fieldLabel("staff", field)}>
                <EditableValue field={field} inFact>
                  {value ? editText.yes : editText.no}
                </EditableValue>
              </Fact>
            ),
        )}
      </dl>
    </section>
  );
}

function ContractGroup({ uid, contract, canChangeJob }: ContractGroupProps) {
  return (
    <section className="profile-group">
      <h3>{profileText.contract}</h3>
      <dl className="stats">
        <Fact label={profileText.job}>{jobLabel(contract.job)}</Fact>
      </dl>
      {canChangeJob && <JobChange uid={uid} job={contract.job} />}
      <WageFact wage={contract.wage} />
      <ContractDates contract={contract} />
    </section>
  );
}

/** The jobs the editor gives, once the app has said which; they do not change during a connection. */
let offeredJobs: Promise<number[]> | null = null;

/**
 * Giving the member of staff another job at their club: a button, then a select of the jobs the editor gives and
 * Apply. Offered while the game can be written to, for a job the editor can take away; the game moves them between
 * the club's departments as the job needs, and the change log can undo it.
 */
function JobChange({ uid, job }: { uid: number; job: number }) {
  const { editable, onEdited } = useContext(EditorContext);
  const selectId = useId();
  const [jobs, setJobs] = useState<number[] | null>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(job);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    offeredJobs ??= staffJobs().catch((e: unknown) => {
      offeredJobs = null;
      throw e;
    });
    offeredJobs.then(
      (codes) => alive && setJobs(codes),
      () => alive && setJobs([]),
    );
    return () => {
      alive = false;
    };
  }, []);

  if (!editable || jobs === null || !jobs.includes(job)) {
    return null;
  }
  if (!open) {
    return (
      <button
        type="button"
        className="job-change"
        title={profileText.changeJobTitle}
        onClick={() => {
          setPicked(job);
          setError(null);
          setOpen(true);
        }}
      >
        {profileText.changeJob}
      </button>
    );
  }
  const byName = [...jobs].sort((a, b) => jobLabel(a).localeCompare(jobLabel(b)));
  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await changeStaffJob(uid, picked);
      setOpen(false);
      // The game has changed: the lists, the profile and the change log read it again.
      onEdited();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="job-change-form">
      <label htmlFor={selectId}>{profileText.newJob}</label>
      <select id={selectId} value={picked} disabled={busy} onChange={(e) => setPicked(Number(e.currentTarget.value))}>
        {byName.map((code) => (
          <option key={code} value={code}>
            {jobLabel(code)}
          </option>
        ))}
      </select>
      <button type="button" className="primary" disabled={busy || picked === job} onClick={() => void apply()}>
        {profileText.applyJob}
      </button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)}>
        {profileText.cancelJob}
      </button>
      {error && (
        <p className="note error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
