import { CompareToggle } from "./Comparison";
import { AbilityEditGroup, EditableValue, EditInput, PositionEditGroup } from "./EditControls";
import { formatPounds } from "./format";
import { ATTRIBUTE_LABELS, fieldLabel, profileText, type AttributeKey } from "./labels";
import { ClubLogo, NationFlag, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { FEET, GOALKEEPING, HIDDEN, isGoalkeeper, MENTAL, PHYSICAL, TECHNICAL } from "./playerAttributes";
import { PositionPitch } from "./PositionPitch";
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
  ]
    .filter(Boolean)
    .join(" · ");

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
      actions={<CompareToggle comparison={comparison} player={{ uid: info.uid, name: info.name }} />}
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

function ContractGroup({ contract }: { contract: Contract }) {
  return (
    <section className="profile-group">
      <h3>{profileText.contract}</h3>
      <div className="profile-split">
        <div>
          <WageFact wage={contract.wage} />
          <dl className="stats">
            <Fact label={profileText.squadStatus}>{profileText.squadStatusName(contract.squadStatus)}</Fact>
            <Fact label={profileText.squadNumber}>{contract.squadNumber ?? profileText.none}</Fact>
          </dl>
        </div>
        <ContractDates contract={contract} />
      </div>
      {(contract.transferListed || contract.loanListed) && (
        <div className="tags">
          {contract.transferListed && <span className="tag listed">{profileText.transferListed}</span>}
          {contract.loanListed && <span className="tag listed">{profileText.loanListed}</span>}
        </div>
      )}
    </section>
  );
}

/** International record, reputation and asking price; while the player is edited, the height is here too. */
function CareerGroup({ details }: { details: PlayerDetails }) {
  const { international, reputation, askingPrice } = details;
  const editingHeight = useEditableField("height");
  return (
    <section className="profile-group">
      <h3>{profileText.career}</h3>
      <div className="profile-split">
        <dl className="stats">
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
            {askingPrice === null ? profileText.notSet : formatPounds(askingPrice)}
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
