import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { call } from "./api";
import {
  changeLanguage,
  changePreference,
  pointPreference,
  removeLanguage,
  removePreference,
  type PreferenceTargetKind,
} from "./editing";
import { listText, profileText, tieText } from "./labels";
import { ClubLine } from "./MoveDialog";
import { ClubLogo, PersonFace, PICTURE_SIZE, WithPicture } from "./Picture";
import { Fact } from "./ProfileParts";
import type {
  ClubPage,
  Related,
  Language,
  PersonRef,
  PlayerPage,
  PlayerSummary,
  Preference,
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

/** The strengths of a preference, and the levels of a language, that the editor writes. */
const STRENGTHS = { least: 1, most: 100 };
const LEVELS = { least: 1, most: 10 };

const isClub = (kind: PreferenceKind) =>
  kind === "favouredClub" || kind === "dislikedClub";

const preferenceName = (preference: Preference) =>
  preference.name ?? String(preference.targetUid);

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
 * The search that points the preference `index` of `person` at another club or, for `club` false, another person: not
 * one his list has already (`taken`), nor himself.
 */
function replacement(person: PersonRef, index: number, club: boolean, taken: ReadonlySet<number>): Replacement {
  const option = (kind: PreferenceTargetKind, uid: number, label: ReactNode): ReplacementOption => ({
    key: `${kind}:${uid}`,
    label,
    choose: () => pointPreference(person.uid, person.staff, index, kind, uid),
  });
  // Enough rows that the ones left out still leave a full list.
  const limit = SEARCH_LIMIT + taken.size + 1;
  const free = (uid: number) => !taken.has(uid) && (club || uid !== person.uid);
  if (club) {
    return {
      label: listText.searchClubs,
      search: async (query) => {
        const page = await call<ClubPage>("search_clubs", { query, limit, filter: {} });
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
        staff.rows.filter((s) => free(s.uid)).map((s) => option("staff", s.uid, <PersonLine person={s} />)),
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
 * The Change button under a list of a profile, which opens `dialog` while the game can be written to. Focus goes back
 * to it once the dialog is gone.
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
      <div className="ties-foot">
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
      </div>
      {open && dialog(() => setOpen(false))}
    </>
  );
}

/**
 * The people and clubs a player or member of staff favours and dislikes, and the button that changes how strongly,
 * points one at another club or person, or takes one out; not there when he has none (see `useListShown`).
 */
export function PreferencesGroup({
  preferences,
  person,
}: {
  preferences: Preference[];
  person: PersonRef;
}) {
  const shown = useListShown(preferences.length > 0, person.uid);
  if (!shown) {
    return null;
  }
  const sections = (): ValueSection[] => {
    // What his list points at already, clubs and people apart: their UIDs can be the same.
    const taken = (club: boolean) =>
      new Set(preferences.filter((p) => isClub(p.kind) === club).map((p) => p.targetUid));
    const takenBy = { club: taken(true), person: taken(false) };
    return PREFERENCE_KINDS.map((kind) => ({
      key: kind,
      heading: profileText.preferenceKinds[kind],
      rows: preferences
        .filter((preference) => preference.kind === kind)
        .map((preference) => {
          const name = preferenceName(preference);
          const club = isClub(kind);
          return {
            index: preference.index,
            name,
            label: club ? <ClubName uid={preference.targetUid} name={name} /> : undefined,
            value: preference.strength,
            replace: replacement(person, preference.index, club, club ? takenBy.club : takenBy.person),
          };
        }),
    }));
  };
  return (
    <section className="profile-group">
      <h3>{profileText.preferences}</h3>
      {preferences.length === 0 && <p className="note">{profileText.none}</p>}
      <dl className="stats">
        {PREFERENCE_KINDS.map((kind) => {
          const listed = preferences.filter(
            (preference) => preference.kind === kind,
          );
          if (listed.length === 0) {
            return null;
          }
          return (
            <Fact key={kind} label={profileText.preferenceKinds[kind]}>
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
    </section>
  );
}

/**
 * The languages a person speaks besides, usually, his native one, and how well, as FM words it, and the button that
 * changes how well, or takes one out; not there when none (see `useListShown`).
 */
export function LanguagesGroup({
  languages,
  person,
}: {
  languages: Language[];
  person: PersonRef;
}) {
  const shown = useListShown(languages.length > 0, person.uid);
  if (!shown) {
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
    },
  ];
  return (
    <section className="profile-group">
      <h3>{profileText.languages}</h3>
      {languages.length === 0 && <p className="note">{profileText.none}</p>}
      <dl className="stats">
        {languages.map((language, index) => (
          <Fact key={index} label={language.name ?? profileText.none}>
            <span title={profileText.languageLevelTitle(language.level)}>{profileText.languageLevel(language.level)}</span>
          </Fact>
        ))}
      </dl>
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
    </section>
  );
}

/** A club's rivals, strongest first, and the clubs it is linked with; each not there when it has none. */
export function ClubTiesGroups({
  rivals,
  links,
}: {
  rivals: Related[];
  links: Related[];
}) {
  return (
    <>
      {rivals.length > 0 && (
        <section className="profile-group">
          <h3>{profileText.rivals}</h3>
          <dl className="stats">
            {rivals.map((rival) => (
              <Fact
                key={rival.uid}
                label={
                  <ClubName
                    uid={rival.uid}
                    name={rival.name ?? String(rival.uid)}
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
                <ClubName uid={link.uid} name={link.name ?? String(link.uid)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
