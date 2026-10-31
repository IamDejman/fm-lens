import { Fragment, type ReactNode } from "react";
import { AbilityEditGroup } from "./EditControls";
import { jobLabel, profileText, STAFF_ATTRIBUTE_LABELS, type StaffAttributeKey } from "./labels";
import { ClubLogo, NationFlag, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import {
  attributeRow,
  bornText,
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
import { useProfileEditing } from "./useProfileEditing";

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
  const vitals = [bornText(info), `${profileText.id} ${info.uid}`].filter(Boolean).join(" · ");

  return (
    <ProfileFrame
      picture={<PersonFace uid={info.uid} name={info.name} size={PICTURE_SIZE.face} />}
      name={info.name}
      fullName={info.fullName}
      badge={info.isHuman ? <HumanBadge /> : undefined}
      meta={dotted([
        info.job !== null && jobLabel(info.job),
        employerLine(info),
        info.nation && (
          <WithPicture inline picture={<NationFlag uid={info.nationUid} />}>
            {info.nation}
          </WithPicture>
        ),
      ])}
      vitals={vitals}
      currentAbility={info.currentAbility}
      potentialAbility={info.potentialAbility}
      loaded={loaded}
      onClose={onClose}
      editing={editing}
    >
      {details && <StaffBody details={details} />}
    </ProfileFrame>
  );
}

function StaffBody({ details }: { details: StaffDetails }) {
  return (
    <>
      <AbilityEditGroup entity="staff" />

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
          {details.contract && <ContractGroup contract={details.contract} />}
          <section className="profile-group">
            <h3>{profileText.reputation}</h3>
            <ReputationBars reputation={details.reputation} />
          </section>
        </div>
      </div>
    </>
  );
}

function attributeRows(details: StaffDetails, keys: StaffAttributeKey[]): RatingRow[] {
  return keys.map((key) =>
    attributeRow(key, STAFF_ATTRIBUTE_LABELS[key], details.attributes[key], {
      scale: STORED_AS_SHOWN.has(key) ? 20 : 100,
    }),
  );
}

function ContractGroup({ contract }: { contract: StaffContract }) {
  return (
    <section className="profile-group">
      <h3>{profileText.contract}</h3>
      <dl className="stats">
        <Fact label={profileText.job}>{jobLabel(contract.job)}</Fact>
      </dl>
      <WageFact wage={contract.wage} />
      <ContractDates contract={contract} />
    </section>
  );
}
