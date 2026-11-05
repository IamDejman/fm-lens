import { profileText } from "./labels";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import { Fact } from "./ProfileParts";
import type { Related, Language, Preference, PreferenceKind } from "./types";

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

/** The people and clubs a player or member of staff favours and dislikes; not there when he has none. */
export function PreferencesGroup({
  preferences,
}: {
  preferences: Preference[];
}) {
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
    </section>
  );
}

/** The languages a person speaks besides, usually, his native one, and how well (out of 10); not there when none. */
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
            {profileText.languageLevel(language.level)}
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
