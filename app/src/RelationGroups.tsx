import { useContext, useEffect, useRef, useState } from "react";
import { likesText, profileText, tieText } from "./labels";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import { PreferencesDialog, type PreferenceOwner } from "./PreferencesDialog";
import { Fact } from "./ProfileParts";
import type { Related, Language, Preference, PreferenceKind } from "./types";
import { EditorContext } from "./useProfileEditing";

/** The order the kinds of preference are listed in: clubs first, as FM's profile does. */
const PREFERENCE_KINDS: readonly PreferenceKind[] = [
  "favouredClub",
  "dislikedClub",
  "favouredPerson",
  "dislikedPerson",
];

const isClub = (kind: PreferenceKind) =>
  kind === "favouredClub" || kind === "dislikedClub";

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

/**
 * The people and clubs a player or member of staff favours and dislikes, and the button that opens the dialog that
 * changes them while the game can be written to; not there when he has none.
 */
export function PreferencesGroup({
  preferences,
  owner,
}: {
  preferences: Preference[];
  owner: PreferenceOwner;
}) {
  const { editable, readOnlyNote } = useContext(EditorContext);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Once the dialog is gone, focus goes back to the button that opened it.
  useEffect(() => {
    if (wasOpen.current && !open) {
      button.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  if (preferences.length === 0) {
    return null;
  }
  return (
    <section className="profile-group">
      <h3>{profileText.preferences}</h3>
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
                  const name = preference.name ?? String(preference.targetUid);
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
      <div className="ties-foot">
        <button
          ref={button}
          type="button"
          className="heal-toggle"
          aria-haspopup="dialog"
          disabled={!editable}
          title={editable ? likesText.changeTitle : readOnlyNote}
          onClick={() => setOpen(true)}
        >
          {tieText.change}
        </button>
      </div>
      {open && (
        <PreferencesDialog
          owner={owner}
          preferences={preferences}
          kinds={PREFERENCE_KINDS}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

/** The languages a person speaks besides, usually, his native one, and how well, as FM words it; not there when none. */
export function LanguagesGroup({ languages }: { languages: Language[] }) {
  if (languages.length === 0) {
    return null;
  }
  return (
    <section className="profile-group">
      <h3>{profileText.languages}</h3>
      <dl className="stats">
        {languages.map((language, index) => (
          <Fact key={index} label={language.name ?? "-"}>
            <span title={profileText.languageLevelTitle(language.level)}>{profileText.languageLevel(language.level)}</span>
          </Fact>
        ))}
      </dl>
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
