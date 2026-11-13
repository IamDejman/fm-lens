// The lists of top players: the best, or the most promising, in the world, a continent, a country or one of its
// divisions, for men's or women's clubs. Each player's profile opens beside the list, as in the player list.

import { useEffect, useId, useState } from "react";
import { Ability } from "./Ability";
import { call } from "./api";
import { ComparisonTray } from "./Comparison";
import { playerListText, positionLabel, profileText, scoutText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { ClubLogo, NationFlag, PICTURE_SIZE, WithPicture } from "./Picture";
import { PlayerProfile, readPlayerTab, type PlayerTab } from "./PlayerProfile";
import { restored, useSnapshot } from "./restore";
import { Stars } from "./ScoutParts";
import type { PlayerRow, TopKind, TopPlaces, TopScope } from "./types";
import { useComparison } from "./useComparison";

const text = scoutText.top;
const columns = playerListText.columns;

/** What the list shows: which list, men's or women's clubs, where ("" for the world, "c:<name>" for a continent,
 * "n:<uid>" for a country) and, in a country, the UID of one of its divisions. */
interface TopChoice {
  kind: TopKind;
  women: boolean;
  where: string;
  division: number | null;
}

const START: TopChoice = { kind: "best", women: false, where: "", division: null };

function readChoice(value: unknown): TopChoice {
  if (typeof value !== "object" || value === null) {
    return START;
  }
  const given = value as Record<string, unknown>;
  return {
    kind: given.kind === "promising" ? "promising" : "best",
    women: given.women === true,
    where: typeof given.where === "string" && given.where.length <= 200 ? given.where : "",
    division: Number.isSafeInteger(given.division) ? (given.division as number) : null,
  };
}

/** The UID of the country chosen, if one is. */
function nationOf(where: string): number | null {
  const uid = Number(where.slice(2));
  return where.startsWith("n:") && Number.isSafeInteger(uid) ? uid : null;
}

function scopeOf({ women, where, division }: TopChoice): TopScope {
  if (where.startsWith("c:")) {
    return { women, continent: where.slice(2) };
  }
  const nation = nationOf(where);
  if (nation !== null) {
    return division === null ? { women, nation } : { women, nation, division };
  }
  return { women };
}

export function TopPlayersBrowser({ version, active }: { version: number; active: boolean }) {
  const [choice, setChoice] = useState<TopChoice>(() => restored("topChoice", readChoice));
  useSnapshot("topChoice", () => choice);
  const [tab, setTab] = useState<PlayerTab>(() => restored("topTab", readPlayerTab));
  useSnapshot("topTab", () => tab);
  const comparison = useComparison();
  const [places, setPlaces] = useState<TopPlaces | null>(null);
  const ids = { kind: useId(), game: useId(), where: useId(), division: useId() };

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    call<TopPlaces>("top_places_list")
      .then((found) => !cancelled && setPlaces(found))
      .catch(() => !cancelled && setPlaces({ continents: [], nations: [], divisions: [] }));
    return () => {
      cancelled = true;
    };
  }, [active, version]);

  // A division belongs to a country and to the men's or women's game, so choosing either again clears it.
  const set = <K extends keyof TopChoice>(key: K, value: TopChoice[K]) =>
    setChoice({ ...choice, division: key === "division" ? choice.division : null, [key]: value });
  const nation = nationOf(choice.where);
  const divisions =
    places && nation !== null ? places.divisions.filter((d) => d.nation === nation && d.women === choice.women) : [];

  return (
    <ListBrowser<PlayerRow>
      name="top"
      command="top_players_list"
      requestArgs={{ kind: choice.kind, scope: scopeOf(choice) }}
      version={version}
      active={active}
      placeholder={text.search}
      summary={(total) => text.summary(total)}
      empty={(query) => text.empty(query)}
      filterBar={
        <div className="filter-fields top-bar">
          <label className="filter-field">
            <span id={ids.kind}>{text.kind}</span>
            <select aria-labelledby={ids.kind} value={choice.kind} onChange={(e) => set("kind", e.currentTarget.value === "promising" ? "promising" : "best")}>
              <option value="best">{text.best}</option>
              <option value="promising">{text.promising}</option>
            </select>
          </label>
          <label className="filter-field">
            <span id={ids.game}>{text.game}</span>
            <select aria-labelledby={ids.game} value={choice.women ? "women" : "men"} onChange={(e) => set("women", e.currentTarget.value === "women")}>
              <option value="men">{text.men}</option>
              <option value="women">{text.women}</option>
            </select>
          </label>
          <label className="filter-field">
            <span id={ids.where}>{text.where}</span>
            <select aria-labelledby={ids.where} value={choice.where} onChange={(e) => set("where", e.currentTarget.value)}>
              <option value="">{text.world}</option>
              {places && places.continents.length > 0 && (
                <optgroup label={text.continents}>
                  {places.continents.map((name) => (
                    <option key={name} value={`c:${name}`}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              )}
              {places && places.nations.length > 0 && (
                <optgroup label={text.nations}>
                  {places.nations.map((nation) => (
                    <option key={nation.uid} value={`n:${nation.uid}`}>
                      {nation.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {divisions.length > 0 ? (
            <label className="filter-field">
              <span id={ids.division}>{text.division}</span>
              <select
                aria-labelledby={ids.division}
                value={divisions.some((d) => d.uid === choice.division) ? String(choice.division) : ""}
                onChange={(e) => set("division", e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
              >
                <option value="">{text.allDivisions}</option>
                {divisions.map((d) => (
                  <option key={d.uid} value={d.uid}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      }
      footer={<ComparisonTray comparison={comparison} />}
      tableClass="player-grid top-grid"
      header={
        <>
          <th className="num col-rank">{text.rank}</th>
          <th className="col-name">{columns.name}</th>
          <th className="num col-age">{columns.age}</th>
          <th className="col-positions">{columns.positions}</th>
          <th className="col-nation">{columns.nation}</th>
          <th className="col-club">{columns.club}</th>
          <th className="num col-ca">{columns.currentAbility}</th>
          <th className="num col-pa">{columns.potentialAbility}</th>
          <th className="num col-dev" title={scoutText.columnTitles.development}>{columns.development}</th>
          <th className="col-progress" title={scoutText.columnTitles.progress}>{columns.progress}</th>
        </>
      }
      cells={(p) => (
        <>
          <td className="num col-rank">{p.rank}</td>
          <td className="col-name" title={p.name}>
            <div className="name">{p.name}</div>
            <div className="sub row-club">{p.club ?? profileText.freeAgent}</div>
          </td>
          <td className="num col-age">{p.age ?? profileText.none}</td>
          <td className="col-positions">{p.positions.slice(0, 3).map(positionLabel).join(" ") || profileText.none}</td>
          <td className="col-nation" title={p.nation ?? undefined}>
            <WithPicture picture={<NationFlag uid={p.nationUid} />}>{p.nation ?? profileText.none}</WithPicture>
          </td>
          <td className="col-club" title={p.club ?? undefined}>
            <WithPicture picture={<ClubLogo uid={p.clubUid} name={p.club} size={PICTURE_SIZE.rowLogo} />}>
              {p.club ?? <span className="muted">{profileText.freeAgent}</span>}
            </WithPicture>
          </td>
          <td className="num col-ca">
            <Ability value={p.currentAbility} />
          </td>
          <td className="num col-pa">
            <Ability value={p.potentialAbility} />
          </td>
          <td className="num col-dev">{p.development === null ? profileText.none : `${p.development}%`}</td>
          <td className="col-progress">{p.progress === null ? profileText.none : <Stars halfStars={p.progress} />}</td>
        </>
      )}
      profile={(p, panel) => (
        <PlayerProfile
          player={p}
          version={panel.version}
          tab={tab}
          onTab={setTab}
          onClose={panel.onClose}
          comparison={comparison}
        />
      )}
    />
  );
}
