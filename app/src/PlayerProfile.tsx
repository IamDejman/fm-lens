import { CompareToggle } from "./Comparison";
import { AbilityEditGroup, EditableValue, EditInput, PositionEditGroup } from "./EditControls";
import { formatPounds } from "./format";
import { ATTRIBUTE_LABELS, fieldLabel, profileText, type AttributeKey } from "./labels";
import { MedicalGroup } from "./MedicalGroup";
import { MoveButton } from "./MoveDialog";
import { ClubLogo, NationFlag, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { FEET, GOALKEEPING, HIDDEN, isGoalkeeper, MENTAL, PHYSICAL, TECHNICAL } from "./playerAttributes";
import { PositionPitch } from "./PositionPitch";
import { ReleaseButton } from "./ReleaseDialog";
import {
  attributeRow,
  bornText,
  ContractDates,
  Fact,
  LOWER_IS_BETTER,
  personalityRows,
  ProfileFrame,
  RatingGroup,
  ReputationBars,
  useProfileDetails,
  WageFact,
  type RatingRow,
} from "./ProfileParts";
import type { Contract, PlayerDetails, PlayerSummary } from "./types";
import type { Comparison } from "./useComparison";
import { useEditableField, useProfileEditing } from "./useProfileEditing";

interface PlayerProfileProps {
  /** The row that was picked; its fields fill the header while the full profile loads. */
  player: PlayerSummary;
  /** Changes when the game data is read again, so the profile is too. */
  version: number;
  onClose: () => void;
  /** The players picked for a comparison: the header has the button that adds this player to it, or takes them out. */
  comparison: Comparison;
}

/** The profile of one player. Mount it with `key={uid}` so a new player starts at the top. */
export function PlayerProfile({ player, version, onClose, comparison }: PlayerProfileProps) {
  const loaded = useProfileDetails<PlayerDetails>("player_details", player.uid, version);
  const editing = useProfileEditing("player", player.uid);
  const details = loaded?.details;
  const info = details ?? player;
  const vitals = [
    bornText(info),
    details && details.heightCm > 0 && profileText.height(details.heightCm),
    `${profileText.uid} ${info.uid}`,
  ];

  return (
    <ProfileFrame
      picture={<PersonFace uid={info.uid} name={info.name} size={PICTURE_SIZE.face} />}
      name={info.name}
      fullName={info.fullName}
      meta={
        <>
          {info.club === null ? (
            <span className="muted">{profileText.freeAgent}</span>
          ) : (
            <WithPicture inline picture={<ClubLogo uid={info.clubUid} name={info.club} size={PICTURE_SIZE.textLogo} />}>
              {info.club}
            </WithPicture>
          )}
          {info.nation && (
            <>
              {" · "}
              <WithPicture inline picture={<NationFlag uid={info.nationUid} />}>
                {info.nation}
              </WithPicture>
            </>
          )}
        </>
      }
      vitals={vitals}
      currentAbility={info.currentAbility}
      potentialAbility={info.potentialAbility}
      loaded={loaded}
      onClose={onClose}
      editing={editing}
      actions={
        <>
          {/* Only while the profile is read, not edited, and for a player who has a club to leave. The Transfer dialog
              starts from his contract, so its button waits for the details. */}
          {editing.editable && editing.stage === "view" && info.club !== null && (
            <div className="move-actions">
              <MoveButton
                player={{ uid: info.uid, name: info.name, club: info.club, clubUid: info.clubUid }}
                contract={details?.contract ?? null}
                ready={details !== undefined}
              />
              <ReleaseButton player={{ uid: info.uid, name: info.name, club: info.club, clubUid: info.clubUid }} />
            </div>
          )}
          <CompareToggle comparison={comparison} player={{ uid: info.uid, name: info.name }} />
        </>
      }
    >
      {details && <ProfileBody details={details} />}
    </ProfileFrame>
  );
}

function ProfileBody({ details }: { details: PlayerDetails }) {
  const goalkeeper = isGoalkeeper(details);
  return (
    <>
      <AbilityEditGroup entity="player" />

      <div className="profile-columns">
        {goalkeeper ? (
          <RatingGroup title={profileText.goalkeeping} rows={attributeRows(details, GOALKEEPING)} />
        ) : (
          <RatingGroup title={profileText.technical} rows={attributeRows(details, TECHNICAL)} />
        )}
        <RatingGroup title={profileText.mental} rows={attributeRows(details, MENTAL)} />
        <RatingGroup title={profileText.physical} rows={attributeRows(details, PHYSICAL)} />
      </div>

      <div className="profile-columns">
        <div className="profile-stack">
          <RatingGroup title={profileText.hidden} rows={attributeRows(details, HIDDEN)} />
          <RatingGroup title={profileText.feet} rows={attributeRows(details, FEET)} />
        </div>
        <RatingGroup title={profileText.personality} rows={personalityRows(details.personality)} />
        <section className="profile-group">
          <h3>{profileText.positions}</h3>
          <PositionPitch ratings={details.positionRatings} />
        </section>
      </div>

      <PositionEditGroup />

      <MedicalGroup details={details} />

      {details.contract && <ContractGroup contract={details.contract} />}
      <CareerGroup details={details} />
    </>
  );
}

function attributeRows(details: PlayerDetails, keys: readonly AttributeKey[]): RatingRow[] {
  return keys.map((key) =>
    attributeRow(key, ATTRIBUTE_LABELS[key], details.attributes[key], { lowerIsBetter: LOWER_IS_BETTER.has(key) }),
  );
}

/**
 * The wage, squad status and number, the dates and the lists the player is on. While he is edited the figures are
 * inputs, and both lists show as checkboxes: a tag shows only for a list he is on.
 */
function ContractGroup({ contract }: { contract: Contract }) {
  const editingListing = useEditableField("contract.transfer_listed");
  return (
    <section className="profile-group">
      <h3>{profileText.contract}</h3>
      <div className="profile-split">
        <div>
          <WageFact wage={contract.wage} />
          <dl className="stats">
            <Fact label={profileText.squadStatus}>
              <EditableValue field="contract.squad_status">
                {profileText.squadStatusName(contract.squadStatus)}
              </EditableValue>
            </Fact>
            <Fact label={profileText.squadNumber}>
              <EditableValue field="contract.squad_number">{contract.squadNumber ?? profileText.none}</EditableValue>
            </Fact>
          </dl>
        </div>
        <ContractDates contract={contract} />
      </div>
      {editingListing ? (
        <div className="tags">
          <EditInput field="contract.transfer_listed" />
          <EditInput field="contract.loan_listed" />
        </div>
      ) : (
        (contract.transferListed || contract.loanListed) && (
          <div className="tags">
            {contract.transferListed && <span className="tag listed">{profileText.transferListed}</span>}
            {contract.loanListed && <span className="tag listed">{profileText.loanListed}</span>}
          </div>
        )
      )}
    </section>
  );
}

/**
 * International record, reputation and asking price; while the player is edited, the nationality, the birth date and
 * the height, which the header shows, are here too.
 */
function CareerGroup({ details }: { details: PlayerDetails }) {
  const { international, reputation, askingPrice } = details;
  const editingNation = useEditableField("nation");
  const editingBirth = useEditableField("date_of_birth");
  const editingHeight = useEditableField("height");
  return (
    <section className="profile-group">
      <h3>{profileText.career}</h3>
      <div className="profile-split">
        <dl className="stats">
          {editingNation && (
            <Fact label={fieldLabel("player", "nation")}>
              <EditInput field="nation" />
            </Fact>
          )}
          {editingBirth && (
            <Fact label={fieldLabel("player", "date_of_birth")}>
              <EditInput field="date_of_birth" />
            </Fact>
          )}
          {editingHeight && (
            <Fact label={fieldLabel("player", "height")}>
              <EditInput field="height" />
            </Fact>
          )}
          <Fact label={profileText.internationalCaps}>
            <EditableValue field="international.caps">{international.caps}</EditableValue>
          </Fact>
          <Fact label={profileText.internationalGoals}>
            <EditableValue field="international.goals">{international.goals}</EditableValue>
          </Fact>
          <Fact label={profileText.u21Caps}>
            <EditableValue field="international.u21_caps">{international.u21Caps}</EditableValue>
          </Fact>
          <Fact label={profileText.u21Goals}>
            <EditableValue field="international.u21_goals">{international.u21Goals}</EditableValue>
          </Fact>
          <Fact label={profileText.askingPrice}>
            <EditableValue field="asking_price">
              {askingPrice === null ? profileText.notSet : formatPounds(askingPrice)}
            </EditableValue>
          </Fact>
        </dl>
        <div>
          <h4>{profileText.reputation}</h4>
          <ReputationBars reputation={reputation} />
        </div>
      </div>
    </section>
  );
}
