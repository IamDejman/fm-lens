import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { call } from "./api";
import {
  addLanguage,
  addPreference,
  addRival,
  changeLanguage,
  changePreference,
  changeRival,
  languageChoices,
  pointPreference,
  removeLanguage,
  removePreference,
  type PreferenceTargetKind,
} from "./editing";
import { fold } from "./format";
import { listText, profileText, tieText } from "./labels";
import { ClubLine } from "./MoveDialog";
import { ClubLogo, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { Fact, GroupHead } from "./ProfileParts";
import type {
  ClubPage,
  Related,
  Language,
  PersonRef,
  PlayerPage,
  PlayerSummary,
  Preference,
  PersonTie,
  PreferenceKind,
  StaffPage,
  StaffSummary,
} from "./types";
import { EditorContext } from "./useProfileEditing";
import { ValueListDialog, type Replacement, type ReplacementOption, type ValueSection } from "./ValueListDialog";

/** The order the kinds of preference are listed in: clubs first, as FM's profile does. */
const PREFERENCE_KINDS: readonly PreferenceKind[] = [
  "favouredClub",
  "dislikedClub",
  "favouredPerson",
  "dislikedPerson",
];

/** The ways a favoured person is family, in the order they are listed in. */
const PERSON_TIES: readonly PersonTie[] = ["father", "son", "brother", "relative"];

/** The lists a person's preferences are shown in: each kind, then his family, favoured people the game shows so. */
const PREFERENCE_LISTS: readonly (readonly [PreferenceKind, PersonTie | null])[] = [
  ...PREFERENCE_KINDS.map((kind) => [kind, null] as const),
  ...PERSON_TIES.map((tie) => ["favouredPerson", tie] as const),
];

/** The strengths of a preference, and the levels of a language, that the editor writes. */
const STRENGTHS = { least: 1, most: 100 };
const LEVELS = { least: 1, most: 10 };

const isClub = (kind: PreferenceKind) =>
  kind === "favouredClub" || kind === "dislikedClub";

const preferenceName = (preference: Preference) =>
  preference.name ?? (isClub(preference.kind) ? profileText.unknownClub : profileText.unknownPerson);

/** How many clubs, or people, the search for another one lists. */
const SEARCH_LIMIT = 8;

/** A club's name with its logo, inline. */
function ClubName({ uid, name }: { uid: number; name: string }) {
  return (
    <WithPicture
      inline
      picture={<ClubLogo uid={uid} name={name} size={PICTURE_SIZE.textLogo} />}
    >
      {name}
    </WithPicture>
  );
}

/** A player or member of staff the search found: his face and name, and his club. */
function PersonLine({ person }: { person: PlayerSummary | StaffSummary }) {
  return (
    <WithPicture picture={<PersonFace uid={person.uid} name={person.name} size={PICTURE_SIZE.rowFace} />}>
      <span className="move-player-text">
        <span className="move-club-name" title={person.name}>
          {person.name}
        </span>
        {person.club !== null && <span className="move-player-detail">{person.club}</span>}
      </span>
    </WithPicture>
  );
}

/**
 * The search for a club or, for `club` false, a person that the list of `person` can take: not one it has already
 * (`taken`), nor himself, nor, unless `you` is set, you. `choose` is what picking one does: it points a preference at
 * it, or adds it.
 */
function targets(
  person: PersonRef,
  club: boolean,
  taken: ReadonlySet<number>,
  you: boolean,
  choose: (kind: PreferenceTargetKind, uid: number) => Promise<unknown>,
): Replacement {
  const option = (kind: PreferenceTargetKind, uid: number, label: ReactNode): ReplacementOption => ({
    key: `${kind}:${uid}`,
    label,
    choose: () => choose(kind, uid),
  });
  // Enough rows that the ones left out still leave a full list.
  const limit = SEARCH_LIMIT + taken.size + 2;
  const free = (uid: number) => !taken.has(uid) && (club || uid !== person.uid);
  if (club) {
    return {
      label: listText.searchClubs,
      search: async (query) => {
        const page = await call<ClubPage>("search_clubs", {
          query,
          limit,
          filter: {},
          pickedFor: { uid: person.uid, staff: person.staff },
        });
        return page.rows
          .filter((found) => free(found.uid))
          .slice(0, SEARCH_LIMIT)
          .map((found) =>
            option("club", found.uid, <ClubLine uid={found.uid} name={found.name} women={found.women} />),
          );
      },
    };
  }
  return {
    label: listText.searchPeople,
    search: async (query) => {
      const [players, staff] = await Promise.all([
        call<PlayerPage>("search_players", { query, limit }),
        call<StaffPage>("search_staff", { query, limit }),
      ]);
      const found = [
        players.rows.filter((p) => free(p.uid)).map((p) => option("player", p.uid, <PersonLine person={p} />)),
        staff.rows
          .filter((s) => free(s.uid) && (you || !s.isHuman))
          .map((s) => option("staff", s.uid, <PersonLine person={s} />)),
      ];
      // Players and staff in turn, so that neither crowds the other out.
      const options: ReplacementOption[] = [];
      for (let at = 0; options.length < SEARCH_LIMIT && at < limit; at++) {
        for (const list of found) {
          if (at < list.length && options.length < SEARCH_LIMIT) {
            options.push(list[at]);
          }
        }
      }
      return options;
    },
  };
}

/**
 * Whether the group of a person's list shows: while the list has entries, and still once the last was taken out, so
 * that its heading and Change button, which focus goes back to, stay until the profile shows another person.
 */
function useListShown(hasEntries: boolean, uid: number): boolean {
  const [shownFor, setShownFor] = useState<number | null>(null);
  if (hasEntries && shownFor !== uid) {
    setShownFor(uid);
  }
  return hasEntries || shownFor === uid;
}

/**
 * The Change button on the heading of a list of a profile, which opens `dialog` while the game can be written to. Focus
 * goes back to it once the dialog is gone.
 */
export function ListChange({
  title,
  dialog,
}: {
  title: string;
  dialog: (onClose: () => void) => ReactNode;
}) {
  const { editable, readOnlyNote } = useContext(EditorContext);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (wasOpen.current && !open) {
      button.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="heal-toggle"
        aria-haspopup="dialog"
        disabled={!editable}
        title={editable ? title : readOnlyNote}
        onClick={() => setOpen(true)}
      >
        {tieText.change}
      </button>
      {open && dialog(() => setOpen(false))}
    </>
  );
}

/**
 * The people and clubs a player or member of staff favours and dislikes, and the button that changes how strongly,
 * points one at another club or person, takes one out or, where the game adds them, adds one. Where it adds none the
 * group is not there for a person who has none (see `useListShown`).
 */
export function PreferencesGroup({
  preferences,
  person,
}: {
  preferences: Preference[];
  person: PersonRef;
}) {
  const { gameActions } = useContext(EditorContext);
  const adds = gameActions.addPreference;
  const shown = useListShown(preferences.length > 0, person.uid);
  if (!shown && !adds) {
    return null;
  }
  const sections = (): ValueSection[] => {
    // What his list points at already, clubs and people apart: their UIDs can be the same.
    const taken = (club: boolean) =>
      new Set(preferences.filter((p) => isClub(p.kind) === club).map((p) => p.targetUid));
    const takenBy = { club: taken(true), person: taken(false) };
    return PREFERENCE_LISTS.map(([kind, tie]) => {
      const club = isClub(kind);
      const taken = club ? takenBy.club : takenBy.person;
      return {
        key: tie ?? kind,
        heading: tie ? profileText.personTies[tie] : profileText.preferenceKinds[kind],
        rows: preferences
          .filter((preference) => preference.kind === kind && preference.tie === tie)
          .map((preference) => {
            const name = preferenceName(preference);
            return {
              index: preference.index,
              name,
              label: club ? <ClubName uid={preference.targetUid} name={name} /> : undefined,
              value: preference.strength,
              replace: targets(person, club, taken, true, (target, uid) =>
                pointPreference(person.uid, person.staff, preference.index, target, uid),
              ),
            };
          }),
        // A new one is as strong as the game's own editor makes it; its row then takes another strength.
        add: adds
          ? targets(person, club, taken, false, (target, uid) =>
              addPreference(person.uid, person.staff, kind, target, uid, STRENGTHS.most, tie),
            )
          : undefined,
      };
    });
  };
  return (
    <section className="profile-group">
      <GroupHead title={profileText.preferences}>
        <ListChange
          title={listText.likesTitle}
          dialog={(onClose) => (
            <ValueListDialog
              title={profileText.preferences}
              who={person.name}
              sections={sections()}
              {...STRENGTHS}
              inputLabel={listText.strengthOf}
              save={(index, strength) => changePreference(person.uid, person.staff, index, strength)}
              remove={(index) => removePreference(person.uid, person.staff, index)}
              list={preferences}
              onClose={onClose}
            />
          )}
        />
      </GroupHead>
      {preferences.length === 0 && <p className="note">{profileText.none}</p>}
      <dl className="stats">
        {PREFERENCE_LISTS.map(([kind, tie]) => {
          const listed = preferences.filter(
            (preference) => preference.kind === kind && preference.tie === tie,
          );
          if (listed.length === 0) {
            return null;
          }
          return (
            <Fact key={tie ?? kind} label={tie ? profileText.personTies[tie] : profileText.preferenceKinds[kind]}>
              <span className="preference-list">
                {listed.map((preference) => {
                  const name = preferenceName(preference);
                  return isClub(kind) ? (
                    <ClubName
                      key={preference.index}
                      uid={preference.targetUid}
                      name={name}
                    />
                  ) : (
                    <span key={preference.index}>{name}</span>
                  );
                })}
              </span>
            </Fact>
          );
        })}
      </dl>
    </section>
  );
}

/**
 * The search for a language of the game that the list has not (`held`), by name. `choose` is what picking one does:
 * it adds it.
 */
function newLanguages(held: ReadonlySet<string>, choose: (name: string) => Promise<unknown>): Replacement {
  // Asked once, when the search opens: the game's languages stay as they are.
  let names: Promise<string[]> | null = null;
  return {
    label: listText.searchLanguages,
    search: async (query) => {
      names ??= languageChoices().catch((e: unknown) => {
        names = null;
        throw e;
      });
      const wanted = fold(query.trim());
      return (await names)
        .filter((name) => !held.has(name) && fold(name).includes(wanted))
        .slice(0, SEARCH_LIMIT)
        .map((name) => ({ key: name, label: name, choose: () => choose(name) }));
    },
  };
}

/**
 * The languages a person speaks besides, usually, his native one, and how well, as FM words it, and the button that
 * changes how well, takes one out or, where the game adds them, adds one. Where it adds none the group is not there
 * for a person who has none (see `useListShown`).
 */
export function LanguagesGroup({
  languages,
  person,
}: {
  languages: Language[];
  person: PersonRef;
}) {
  const { gameActions } = useContext(EditorContext);
  const adds = gameActions.addLanguage;
  const shown = useListShown(languages.length > 0, person.uid);
  if (!shown && !adds) {
    return null;
  }
  const sections = (): ValueSection[] => [
    {
      key: "languages",
      heading: null,
      rows: languages.map((language, index) => ({
        index,
        name: language.name ?? profileText.none,
        note: language.local ? listText.raisedBack : undefined,
        value: language.level,
      })),
      // A new one is spoken as well as a language gets; its row then takes another level.
      add: adds
        ? newLanguages(new Set(languages.flatMap((language) => language.name ?? [])), (name) =>
            addLanguage(person.uid, person.staff, name, LEVELS.most),
          )
        : undefined,
    },
  ];
  return (
    <section className="profile-group">
      <GroupHead title={profileText.languages}>
        <ListChange
          title={listText.languagesTitle}
          dialog={(onClose) => (
            <ValueListDialog
              title={profileText.languages}
              who={person.name}
              sections={sections()}
              {...LEVELS}
              inputLabel={listText.levelOf}
              save={(index, level) => changeLanguage(person.uid, person.staff, index, level)}
              remove={(index) => removeLanguage(person.uid, person.staff, index)}
              list={languages}
              onClose={onClose}
            />
          )}
        />
      </GroupHead>
      {languages.length === 0 && <p className="note">{profileText.none}</p>}
      <dl className="stats">
        {languages.map((language, index) => (
          <Fact key={index} label={language.name ?? profileText.none}>
            <span title={profileText.languageLevelTitle(language.level)}>{profileText.languageLevel(language.level)}</span>
          </Fact>
        ))}
      </dl>
    </section>
  );
}

/**
 * A club's rivals, strongest first, with the button that changes how strong a rivalry is, ends one or adds one, and
 * the clubs it is linked with; each not there when it has none.
 */
export function ClubTiesGroups({
  club,
  rivals,
  links,
}: {
  club: { uid: number; name: string };
  rivals: Related[];
  links: Related[];
}) {
  const shown = useListShown(rivals.length > 0, club.uid);
  const sections = (): ValueSection[] => {
    const taken = new Set([club.uid, ...rivals.map((rival) => rival.uid)]);
    return [
      {
        key: "rivals",
        heading: null,
        // A rival is told by its club, not by its place in the list: the list here is in order of strength.
        rows: rivals.map((rival) => {
          const name = rival.name ?? profileText.unknownClub;
          return { index: rival.uid, name, label: <ClubName uid={rival.uid} name={name} />, value: rival.strength ?? 0 };
        }),
        add: {
          label: listText.searchClubs,
          search: async (query) => {
            const page = await call<ClubPage>("search_clubs", {
              query,
              limit: SEARCH_LIMIT + taken.size,
              filter: {},
            });
            return page.rows
              .filter((found) => !taken.has(found.uid))
              .slice(0, SEARCH_LIMIT)
              .map((found) => ({
                key: `club:${found.uid}`,
                label: <ClubLine uid={found.uid} name={found.name} women={found.women} />,
                choose: () => addRival(club.uid, found.uid, STRENGTHS.most),
              }));
          },
        },
      },
    ];
  };
  return (
    <>
      {shown && (
        <section className="profile-group">
          <GroupHead title={profileText.rivals}>
            <ListChange
              title={listText.rivalsTitle}
              dialog={(onClose) => (
                <ValueListDialog
                  title={profileText.rivals}
                  who={club.name}
                  sections={sections()}
                  {...STRENGTHS}
                  inputLabel={listText.strengthOf}
                  save={(rival, strength) => changeRival(club.uid, rival, strength)}
                  remove={(rival) => changeRival(club.uid, rival, null)}
                  list={rivals}
                  onClose={onClose}
                />
              )}
            />
          </GroupHead>
          <dl className="stats">
            {rivals.map((rival) => (
              <Fact
                key={rival.uid}
                label={
                  <ClubName
                    uid={rival.uid}
                    name={rival.name ?? profileText.unknownClub}
                  />
                }
              >
                {rival.strength ?? "-"}
              </Fact>
            ))}
          </dl>
        </section>
      )}
      {links.length > 0 && (
        <section className="profile-group">
          <h3>{profileText.linkedClubs}</h3>
          <ul className="club-ties">
            {links.map((link) => (
              <li key={link.uid}>
                <ClubName uid={link.uid} name={link.name ?? profileText.unknownClub} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
