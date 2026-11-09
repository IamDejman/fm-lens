import { useContext, useEffect, useId, useRef, useState } from "react";
import { AttributeActions, ToolsToggle } from "./AttributeActions";
import { ClauseList } from "./ClauseList";
import { CompareToggle } from "./Comparison";
import { EditableValue, EditInput, SharedRangeHint } from "./EditControls";
import { call } from "./api";
import { keepPlaying, setWorkPermit, wholePercent, workPermitNeeded } from "./editing";
import { describeError, formatDate, formatNumber, formatMoney } from "./format";
import { ATTRIBUTE_LABELS, editText, fieldLabel, positionLabel, profileText, type AttributeKey } from "./labels";
import { MedicalGroups, percentText } from "./MedicalGroup";
import { PromisesGroup } from "./PromisesGroup";
import { MoveButton } from "./MoveDialog";
import { ClubLogo, NationFlag, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { FEET, GOALKEEPING, HIDDEN, isGoalkeeper, MENTAL, PHYSICAL, TECHNICAL } from "./playerAttributes";
import { PositionPitch, PositionRatings } from "./PositionPitch";
import { CancelTransferButton, EndLoanButton, ReleaseButton } from "./ReleaseDialog";
import { LanguagesGroup, PreferencesGroup } from "./RelationGroups";
import { TiesGroup } from "./TiesGroup";
import {
  attributeRow,
  ContractDates,
  Fact,
  focusLost,
  GroupHead,
  LOWER_IS_BETTER,
  PersonalGroup,
  personalityRows,
  ProfileFrame,
  ProfileTabs,
  RatingGroup,
  RatingList,
  ReputationBars,
  useProfileDetails,
  WageFact,
  type RatingRow,
} from "./ProfileParts";
import type {
  ApplyReport,
  Concern,
  Contract,
  FmDate,
  FutureTransfer,
  LoanTerms,
  PlayerDetails,
  PlayerSummary,
} from "./types";
import type { Comparison } from "./useComparison";
import { EditorContext, useEditableField, useProfileEditing } from "./useProfileEditing";

/** The tabs of a player's profile, in their order. */
const TABS = ["attributes", "mood", "contract", "medical", "career"] as const;

export type PlayerTab = (typeof TABS)[number];

/** The tab kept from the last session, or Attributes. */
export const readPlayerTab = (value: unknown): PlayerTab => TABS.find((tab) => tab === value) ?? "attributes";

interface PlayerProfileProps {
  /** The row that was picked; its fields fill the header while the full profile loads. */
  player: PlayerSummary;
  /** Changes when the game data is read again, so the profile is too. */
  version: number;
  /** The tab on show; kept by the list, so the next player picked opens on it too. */
  tab: PlayerTab;
  onTab: (tab: PlayerTab) => void;
  onClose: () => void;
  /** The players picked for a comparison: the header has the button that adds this player to it, or takes them out. */
  comparison: Comparison;
}

/** The profile of one player. Mount it with `key={uid}` so a new player starts at the top. */
export function PlayerProfile({ player, version, tab, onTab, onClose, comparison }: PlayerProfileProps) {
  const loaded = useProfileDetails<PlayerDetails>("player_details", player.uid, version);
  const editing = useProfileEditing("player", player.uid);
  const { gameActions } = useContext(EditorContext);
  const [toolsOpen, setToolsOpen] = useState(false);
  const base = useId();
  const tools = useId();
  const panel = useRef<HTMLDivElement>(null);
  const details = loaded?.details;
  const info = details ?? player;
  // A move FM agreed for him on a later day: its dialog shows the first one, and cancels all of them, as FM's editor.
  const agreed = details?.futureTransfers[0];

  // Another tab starts at its top, wherever the last one was scrolled to.
  const select = (next: PlayerTab) => {
    onTab(next);
    panel.current?.closest(".profile-body")?.scrollTo({ top: 0 });
  };

  return (
    <ProfileFrame
      picture={<PersonFace uid={info.uid} name={info.name} size={PICTURE_SIZE.face} />}
      name={info.name}
      // The full name, the birth date, the height and the ID are under Personal details on the Career tab.
      fullName={null}
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
              <EditableValue field="nation">
                <WithPicture inline picture={<NationFlag uid={info.nationUid} />}>
                  {info.nation}
                </WithPicture>
              </EditableValue>
            </>
          )}
          {info.age !== null && ` · ${profileText.age(info.age)}`}
          {info.positions.length > 0 && ` · ${positionLabel(info.positions[0])}`}
        </>
      }
      status={details && <StatusChips details={details} onTab={select} />}
      currentAbility={info.currentAbility}
      potentialAbility={info.potentialAbility}
      loaded={loaded}
      onClose={onClose}
      editing={editing}
      headActions={<CompareToggle comparison={comparison} player={{ uid: info.uid, name: info.name }} />}
      actions={
        // Only while the profile is read, not edited: for a player who has a club to leave, or a free agent where the
        // game signs them. The Transfer dialog starts from his contract, so its button waits for the details.
        editing.editable &&
        editing.stage === "view" &&
        (info.club !== null || gameActions.signFreeAgent) && (
          <div className="move-actions">
            <MoveButton
              player={{ uid: info.uid, name: info.name, club: info.club, clubUid: info.clubUid }}
              contract={details?.contract ?? null}
              ready={details !== undefined}
              agreed={agreed}
            />
            {/* A loaned player is not released: where the game ends loans, his loan is ended instead. Which of the
                two he has is in the details, so the button waits for them. */}
            {info.club !== null &&
              details !== undefined &&
              (details.loan ? (
                gameActions.endLoan && (
                  <EndLoanButton player={{ uid: info.uid, name: info.name, club: info.club, clubUid: info.clubUid }} />
                )
              ) : (
                <ReleaseButton player={{ uid: info.uid, name: info.name, club: info.club, clubUid: info.clubUid }} />
              ))}
            {gameActions.futureTransfer && agreed !== undefined && (
              <CancelTransferButton
                player={{
                  uid: info.uid,
                  name: info.name,
                  club: agreed.club ?? profileText.none,
                  clubUid: agreed.clubUid,
                }}
              />
            )}
          </div>
        )
      }
      tabs={
        details && (
          <ProfileTabs
            tabs={TABS}
            tab={tab}
            base={base}
            label={profileText.tabsLabel}
            names={profileText.tabs}
            onSelect={select}
            end={
              tab === "attributes" &&
              editing.stage === "view" && (
                <ToolsToggle open={toolsOpen} controls={tools} onToggle={() => setToolsOpen((was) => !was)} />
              )
            }
          />
        )
      }
    >
      {details && (
        <div
          ref={panel}
          className="profile-panel"
          role="tabpanel"
          id={`${base}-panel`}
          aria-labelledby={`${base}-${tab}`}
        >
          {tab === "attributes" && <AttributesTab details={details} toolsOpen={toolsOpen} tools={tools} />}
          {tab === "mood" && <MoodTab details={details} />}
          {tab === "contract" && <ContractTab details={details} />}
          {tab === "medical" && <MedicalGroups details={details} />}
          {tab === "career" && <CareerTab details={details} />}
        </div>
      )}
    </ProfileFrame>
  );
}

/** A tone for a chip: how good the news is. */
type Tone = "good" | "warn" | "bad" | undefined;

/** Morale out of 20: very low or low are bad news, very high good. */
const moraleTone = (morale: number): Tone =>
  morale <= 5 ? "bad" : morale <= 9 ? "warn" : morale >= 15 ? "good" : undefined;

/**
 * Under the header: whether he is injured (or else his energy), banned, his morale, what makes him unhappy and when
 * his contract ends. Each opens the tab that has it.
 */
function StatusChips({ details, onTab }: { details: PlayerDetails; onTab: (tab: PlayerTab) => void }) {
  const concerns = details.contract?.concerns.filter((concern) => concern.ended === null).length ?? 0;
  const expires = details.contract?.expires;
  const chips: { key: string; text: string; tone: Tone; tab: PlayerTab }[] = [
    details.injuries.length > 0
      ? { key: "injured", text: profileText.injured, tone: "bad", tab: "medical" }
      : {
          key: "energy",
          text: `${fieldLabel("player", "condition")} ${percentText(details.condition)}`,
          tone: wholePercent(details.condition) >= 90 ? "good" : "warn",
          tab: "medical",
        },
  ];
  if (details.bans.length > 0) {
    chips.push({ key: "banned", text: profileText.banned, tone: "bad", tab: "medical" });
  }
  chips.push({
    key: "morale",
    text: `${fieldLabel("player", "morale")} ${profileText.morale(details.morale)}`,
    tone: moraleTone(details.morale),
    tab: "mood",
  });
  if (concerns > 0) {
    chips.push({ key: "concerns", text: profileText.concerns(concerns), tone: "bad", tab: "mood" });
  }
  if (expires) {
    chips.push({
      key: "contract",
      text: profileText.contractTo(formatDate(expires)),
      tone: undefined,
      tab: "contract",
    });
  }
  return (
    <ul className="status-chips" aria-label={profileText.statusLabel}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <button type="button" className="status-chip" data-tone={chip.tone} onClick={() => onTab(chip.tab)}>
            {chip.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * His attributes, with Set all and Freeze above them while Tools is open, the positions he plays with their ratings on
 * the pitch (inputs under it while he is edited) and his traits.
 */
function AttributesTab({ details, toolsOpen, tools }: { details: PlayerDetails; toolsOpen: boolean; tools: string }) {
  const goalkeeper = isGoalkeeper(details);
  const editingPositions = useEditableField("position.gk");
  const editingTraits = useEditableField("trait.0");
  return (
    <>
      <AttributeActions uid={details.uid} open={toolsOpen} panel={tools} />

      {/* Attributes, personality and position ratings all take 1 to 20: one hint says it for all of them. */}
      <SharedRangeHint field="attribute.determination" />

      <div className="profile-pair">
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
          <RatingGroup title={profileText.hidden} rows={attributeRows(details, HIDDEN)} />
          <section className="profile-group">
            <h3>{profileText.personality}</h3>
            <RatingList rows={personalityRows(details.personality)} />
            {!editingTraits && <TraitTags traits={details.traits} />}
          </section>
          <section className="profile-group">
            <h3>{profileText.positions}</h3>
            <PositionPitch ratings={details.positionRatings} />
            <RatingList rows={attributeRows(details, FEET)} />
          </section>
        </div>
      </div>

      {editingPositions && <PositionRatings ratings={details.positionRatings} />}

      {editingTraits && <TraitsEditor />}
    </>
  );
}

/** His morale and happiness, what makes him unhappy, the promises made to him, and whom and what he likes. */
function MoodTab({ details }: { details: PlayerDetails }) {
  const { contract } = details;
  return (
    <>
      <section className="profile-group">
        <h3>{profileText.moraleAndHappiness}</h3>
        <dl className="stats">
          <Fact label={fieldLabel("player", "morale")} title={profileText.moraleTitle}>
            <EditableValue field="morale">{profileText.morale(details.morale)}</EditableValue>
          </Fact>
          {contract && (
            <>
              <Fact label={profileText.happiness} title={profileText.moodTitle}>
                <EditableValue field="contract.happiness">{formatNumber(contract.happiness)}</EditableValue>
              </Fact>
              <Fact label={profileText.playingTimeHappiness} title={profileText.moodTitle}>
                <EditableValue field="contract.playing_time_happiness">
                  {formatNumber(contract.playingTimeHappiness)}
                </EditableValue>
              </Fact>
            </>
          )}
        </dl>
      </section>
      {contract && <ConcernList uid={details.uid} concerns={contract.concerns} />}
      <PromisesGroup uid={details.uid} promises={details.promises} />
      <PreferencesGroup
        preferences={details.preferences}
        person={{ uid: details.uid, staff: false, name: details.name }}
      />
    </>
  );
}

/** His contract and its clauses, his asking price, any loan or agreed move, and his work permits. */
function ContractTab({ details }: { details: PlayerDetails }) {
  const { contract } = details;
  return (
    <>
      {contract ? (
        <ContractGroup details={details} contract={contract} />
      ) : (
        <section className="profile-group">
          <h3>{profileText.contract}</h3>
          <p className="note">{profileText.noContract}</p>
          <dl className="stats">
            <AskingPrice price={details.askingPrice} />
          </dl>
        </section>
      )}
      {contract && (
        <ClauseList uid={details.uid} name={details.name} clauses={contract.clauses} room={details.clauseRoom} />
      )}
      {details.loan && <LoanGroup loan={details.loan} />}
      {details.futureTransfers.length > 0 && <FutureTransferGroup transfers={details.futureTransfers} />}
      <WorkPermitGroup details={details} />
    </>
  );
}

/** His international record, reputation and retirement; his nationality and homegrown status, and his languages. */
function CareerTab({ details }: { details: PlayerDetails }) {
  return (
    <>
      <PersonalGroup
        entity="player"
        name={details.name}
        fullName={details.fullName}
        dateOfBirth={details.dateOfBirth}
        height={details.heightCm > 0 && <Height cm={details.heightCm} />}
        uid={details.uid}
      />
      <CareerGroups details={details} />
      <TiesGroup details={details} />
      <LanguagesGroup languages={details.languages} person={{ uid: details.uid, staff: false, name: details.name }} />
    </>
  );
}

/** "178 cm" under Personal details; the number is an input while the player is edited. */
function Height({ cm }: { cm: number }) {
  if (!useEditableField("height")) {
    return profileText.height(cm);
  }
  return (
    <span className="edit-with-unit">
      <EditInput field="height" />
      {profileText.heightUnit}
    </span>
  );
}

function attributeRows(details: PlayerDetails, keys: readonly AttributeKey[]): RatingRow[] {
  return keys.map((key) =>
    attributeRow(key, ATTRIBUTE_LABELS[key], details.attributes[key], { lowerIsBetter: LOWER_IS_BETTER.has(key) }),
  );
}

/**
 * The wage, squad status and number, whether he is on the transfer and the loan list, his asking price, and the dates.
 * While he is edited each value is an input where it is shown, a list a checkbox.
 */
function ContractGroup({ details, contract }: { details: PlayerDetails; contract: Contract }) {
  const yesNo = (on: boolean) => (on ? editText.yes : editText.no);
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
            <Fact label={profileText.transferListed}>
              <EditableValue field="contract.transfer_listed" inFact>
                {yesNo(contract.transferListed)}
              </EditableValue>
            </Fact>
            <Fact label={profileText.loanListed}>
              <EditableValue field="contract.loan_listed" inFact>
                {yesNo(contract.loanListed)}
              </EditableValue>
            </Fact>
            <Fact label={profileText.loyaltyBonus}>
              <EditableValue field="contract.loyalty_bonus">{formatMoney(contract.loyaltyBonus)}</EditableValue>
            </Fact>
            <AskingPrice price={details.askingPrice} />
          </dl>
        </div>
        <ContractDates contract={contract} />
      </div>
    </section>
  );
}

/** What his club asks for him; an input while he is edited. */
function AskingPrice({ price }: { price: number | null }) {
  return (
    <Fact label={profileText.askingPrice}>
      <EditableValue field="asking_price">{price === null ? profileText.notSet : formatMoney(price)}</EditableValue>
    </Fact>
  );
}

/** The loan he is on: the club he is on loan from, what the borrower pays, when the loan ends and any future fee. */
function LoanGroup({ loan }: { loan: LoanTerms }) {
  const date = (value: FmDate | null) => formatDate(value) || profileText.none;
  return (
    <section className="profile-group">
      <h3>{profileText.loan}</h3>
      <dl className="stats">
        <Fact label={profileText.loanFrom}>{loan.parent ?? profileText.none}</Fact>
        <Fact label={profileText.loanWage}>
          <EditableValue field="loan.wage">{formatMoney(loan.wage)}</EditableValue>
        </Fact>
        <Fact label={profileText.loanStarts}>{date(loan.starts)}</Fact>
        <Fact label={profileText.loanEnds}>
          <EditableValue field="loan.ends">{date(loan.ends)}</EditableValue>
        </Fact>
        {loan.futureFee !== null && <Fact label={profileText.loanFutureFee}>{formatMoney(loan.futureFee)}</Fact>}
      </dl>
    </section>
  );
}

/** The moves FM agreed for him on a later day: the club he joins, and the day. */
function FutureTransferGroup({ transfers }: { transfers: FutureTransfer[] }) {
  return (
    <section className="profile-group">
      <h3>{profileText.futureTransfer}</h3>
      {transfers.map((transfer) => (
        <dl key={transfer.offer} className="stats">
          <Fact label={profileText.futureClub}>
            {transfer.club === null ? (
              profileText.none
            ) : (
              <WithPicture
                inline
                picture={<ClubLogo uid={transfer.clubUid} name={transfer.club} size={PICTURE_SIZE.textLogo} />}
              >
                {transfer.club}
              </WithPicture>
            )}
          </Fact>
          <Fact label={profileText.futureJoins}>{formatDate(transfer.joins) || profileText.none}</Fact>
        </dl>
      ))}
    </section>
  );
}

/**
 * His work permits: for each nation, an active work permit or an ESC slot from a day. Where the game gives them itself
 * on this build, a player at a club has the button on the heading that has it give him one for his club's country
 * (Request permit), or take his away (Revoke); then the group is there even while he holds none. Request permit waits
 * for FM's rules, and gives way to "Not needed" where they say he needs none, as FM would then give none; where FM
 * Lens cannot ask, it is offered as before. Actual changes are logged and undone from Changes.
 */
export function WorkPermitGroup({ details }: { details: Pick<PlayerDetails, "uid" | "club" | "workPermits"> }) {
  const { gameActions, editable, readOnlyNote, onEdited } = useContext(EditorContext);
  const permits = details.workPermits;
  const granted = permits.length > 0;
  const changeable = gameActions.workPermit && details.club !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notIssued, setNotIssued] = useState(false);
  const asking = changeable && !granted;
  // What FM's rules last said of a player: null where FM Lens cannot ask.
  const [answered, setAnswered] = useState<{ uid: number; needed: boolean | null } | null>(null);
  // Undefined until FM answers for this player.
  const needed = asking && answered?.uid === details.uid ? answered.needed : undefined;

  // Asked again each time the profile reads the game, which gives new permits; the last answer stands meanwhile.
  useEffect(() => {
    if (!asking) {
      return;
    }
    let current = true;
    const uid = details.uid;
    workPermitNeeded(uid).then(
      (answer) => {
        if (current) {
          setAnswered({ uid, needed: answer });
        }
      },
      () => {
        if (current) {
          setAnswered({ uid, needed: null });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [details.uid, asking, permits]);

  // The button stays busy until the profile has read the game again, which gives new permits.
  useEffect(() => {
    setBusy(false);
  }, [permits]);

  useEffect(() => {
    setNotIssued(false);
    setError(null);
  }, [details.uid, granted]);

  if (!granted && !changeable) {
    return null;
  }

  const toggle = async () => {
    // While it is under way the button is only dimmed (aria-disabled), not disabled: a disabled button loses focus.
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotIssued(false);
    try {
      await setWorkPermit(details.uid, !granted);
      onEdited();
    } catch (e) {
      // An unforced request can leave no record under FM's own rules. That is not a confirmed grant.
      if (!granted && typeof e === "object" && e !== null && "code" in e && e.code === "call.declined") {
        setNotIssued(true);
        onEdited();
      } else {
        setError(describeError(e));
      }
      setBusy(false);
    }
  };

  return (
    <section className="profile-group">
      <GroupHead title={profileText.workPermit}>
        {changeable && (granted || (needed !== undefined && needed !== false)) && (
          <button
            type="button"
            className="heal-toggle"
            disabled={!editable}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            title={editable ? undefined : readOnlyNote}
            onClick={() => void toggle()}
          >
            {granted ? profileText.revokePermit : profileText.requestPermit}
          </button>
        )}
      </GroupHead>
      {notIssued && <p className="injuries-none" role="status">{profileText.permitNotIssued}</p>}
      {error !== null && (
        <p className="heal-error" role="alert">
          {error}
        </p>
      )}
      {granted ? (
        <dl className="stats">
          {permits.map((permit, index) => (
            <Fact key={permit.nationUid ?? index} label={permit.nation ?? profileText.none}>
              {permit.esc
                ? profileText.permitEsc(formatDate(permit.escSince) || profileText.none)
                : profileText.permitActive}
            </Fact>
          ))}
        </dl>
      ) : !notIssued && (
        <p className="injuries-none">{needed === false ? profileText.permitNotNeeded : profileText.permitNone}</p>
      )}
    </section>
  );
}

/**
 * The reasons to be unhappy that last, by name, with the button that removes them all (FMRTE's "Remove all"): the
 * count of the player's list goes to none, and an undo in Changes lists them again.
 */
function ConcernList({ uid, concerns }: { uid: number; concerns: Concern[] }) {
  const { editable, onEdited } = useContext(EditorContext);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lasting = concerns.filter((concern) => concern.ended === null);

  useEffect(() => {
    setRemoving(false);
  }, [concerns]);

  const remove = async () => {
    if (removing) {
      return;
    }
    setRemoving(true);
    setError(null);
    try {
      const report = await call<ApplyReport>("apply_edits", {
        entity: "player",
        uid,
        edits: [{ field: "contract.unhappiness", expected: concerns.length, value: 0 }],
      });
      if (report.failed.length > 0) {
        throw report.failed[0].error;
      }
      onEdited();
    } catch (e) {
      setError(describeError(e));
      setRemoving(false);
    }
  };

  return (
    <section className="profile-group">
      <GroupHead title={profileText.unhappiness}>
        <button
          type="button"
          className="heal-toggle"
          disabled={!editable || lasting.length === 0}
          aria-disabled={removing || undefined}
          title={profileText.removeUnhappinessTitle}
          onClick={() => void remove()}
        >
          {removing ? profileText.removingUnhappiness : profileText.removeUnhappiness}
        </button>
      </GroupHead>
      {lasting.length === 0 ? (
        <p className="note">{profileText.noUnhappiness}</p>
      ) : (
        <dl className="stats">
          {lasting.map((concern, i) => (
            <Fact key={i} label={profileText.concernMotive(concern.motive)}>
              {[profileText.concernKind(concern.kind), concern.started && profileText.concernSince(formatDate(concern.started))]
                .filter(Boolean)
                .join(" · ")}
            </Fact>
          ))}
        </dl>
      )}
      {error && <p className="banner" role="alert">{error}</p>}
    </section>
  );
}

/** The bits a player's traits are kept in: `trait.0` to `trait.63`. FMRTE's list names the first 62. */
const TRAIT_BITS = Array.from({ length: 64 }, (_, bit) => bit);

/** His traits (preferred moves) by name, under his personality. */
function TraitTags({ traits }: { traits: number[] }) {
  return traits.length === 0 ? (
    <p className="note">{profileText.noTraits}</p>
  ) : (
    <ul className="tags" aria-label={profileText.traits}>
      {traits.map((bit) => (
        <li key={bit} className="tag">
          {profileText.traitName(bit)}
        </li>
      ))}
    </ul>
  );
}

/** While he is edited, a checkbox for each of his traits, which writes its bit of the mask: the width of the profile. */
function TraitsEditor() {
  return (
    <section className="profile-group">
      <h3>{profileText.traits}</h3>
      <div className="tags traits-edit">
        {TRAIT_BITS.map((bit) => (
          <EditInput key={bit} field={`trait.${bit}`} />
        ))}
      </div>
    </section>
  );
}

/** His international record and reputation, and the retirement the game plans for him. */
function CareerGroups({ details }: { details: PlayerDetails }) {
  const { international, reputation } = details;
  return (
    <>
      <section className="profile-group">
        <h3>{profileText.international}</h3>
        <dl className="stats">
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
        </dl>
      </section>
      <section className="profile-group">
        <h3>{profileText.reputation}</h3>
        <ReputationBars reputation={reputation} />
      </section>
      {details.retirementKnown && <RetirementPlan uid={details.uid} retires={details.retires} />}
    </>
  );
}

/**
 * The date the game plans the player to retire on, with the button that keeps him playing: his plan comes out of the
 * game's, and he gets the trait to play on as long as possible. Like healing, it asks no question; Changes undoes it.
 */
function RetirementPlan({ uid, retires }: { uid: number; retires: FmDate | null }) {
  const { editable, readOnlyNote, onEdited } = useContext(EditorContext);
  const [keeping, setKeeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planned = retires !== null;
  const none = useRef<HTMLParagraphElement>(null);
  const wasPlanned = useRef(planned);

  // The button stays busy until the profile has read the game again.
  useEffect(() => {
    setKeeping(false);
  }, [retires]);

  // Keeping him playing dims the button, which had focus: it goes to the line that says so.
  useEffect(() => {
    if (wasPlanned.current && !planned && focusLost()) {
      none.current?.focus();
    }
    wasPlanned.current = planned;
  }, [planned]);

  const keep = async () => {
    if (keeping) {
      return;
    }
    setKeeping(true);
    setError(null);
    try {
      await keepPlaying(uid);
      onEdited();
    } catch (e) {
      setError(describeError(e));
      setKeeping(false);
    }
  };

  return (
    <section className="profile-group">
      <GroupHead title={profileText.retirement}>
        <button
          type="button"
          className="heal-toggle"
          disabled={!editable || !planned}
          aria-disabled={keeping || undefined}
          aria-busy={keeping || undefined}
          title={editable ? profileText.keepPlayingTitle : readOnlyNote}
          onClick={() => void keep()}
        >
          {keeping ? profileText.keepingPlaying : profileText.keepPlaying}
        </button>
      </GroupHead>
      {retires === null ? (
        <p ref={none} tabIndex={-1} className="injuries-none">
          {profileText.noRetirement}
        </p>
      ) : (
        <dl className="stats">
          <Fact label={profileText.retires}>{formatDate(retires)}</Fact>
        </dl>
      )}
      {error && <p className="banner" role="alert">{error}</p>}
    </section>
  );
}
