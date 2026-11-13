import { useState } from "react";
import { Ability } from "./Ability";
import { BestForSelect, FitCell, FitHeader, useBestFor, YourBest } from "./BestFor";
import { PLAYER_RECIPES } from "./recipes";
import { ComparisonTray } from "./Comparison";
import { ExportButton } from "./ExportDialog";
import { formatDate, formatMoney, formatNumber } from "./format";
import { playerListText, positionLabel, profileText, scoutText } from "./labels";
import { ListBrowser, type Reveal } from "./ListBrowser";
import { MassEditButton } from "./MassEditDialog";
import { MoreMenu } from "./MoreMenu";
import { ClubLogo, NationFlag, PICTURE_SIZE, WithPicture } from "./Picture";
import { attributeHeading, attributeName, ColumnsButton, usePlayerColumns, type PlayerColumn } from "./PlayerColumns";
import {
  countFilters,
  NO_PLAYER_FILTERS,
  PlayerFilterBar,
  toPlayerFilter,
  type PlayerFilterFields,
} from "./PlayerFilters";
import { PlayerProfile, readPlayerTab, type PlayerTab } from "./PlayerProfile";
import { PlayerTemplatesButton } from "./PlayerTemplates";
import { restored, useSnapshot } from "./restore";
import { SavedFilterControls } from "./SavedFilterControls";
import { toRoleBounds } from "./RoleFilters";
import { ATTRIBUTE_SORT, PLAYER_SAVED, PLAYER_SORTS, readFields, ROLE_SORT } from "./savedFilters";
import { Stars } from "./ScoutParts";
import { roleLabel, roleShort } from "./scoutRoles";
import { SortHeader, useListSort, type ListSort } from "./SortHeader";
import type { PlayerColumnSort, PlayerOrder, PlayerRow, PlayerSort } from "./types";
import { useComparison } from "./useComparison";

const text = playerListText;

/** What the list is in until a column header is clicked: the best players first. */
const DEFAULT_ORDER: PlayerOrder = { by: "currentAbility", ascending: false };

/** The columns whose first click sorts from A to Z or from the earliest date; the numbers start with the highest. */
const FIRST_ASCENDING: readonly PlayerSort[] = ["name", "nation", "club", "contractExpires"];

/** How many positions a row shows before the ellipsis; its hover text has all of them. */
const POSITIONS_SHOWN = 3;

/** The columns of the list that sort it, but for the attributes and the roles. */
type ColumnSort = PlayerColumnSort | "development" | "progress";

/** A player to compare the list with, asked for from a profile; each new object is a new request. */
export interface SimilarRequest {
  uid: number;
  name: string;
  /** Both at their peak, rather than as they are today. */
  peak: boolean;
}

interface PlayerBrowserProps {
  version: number;
  active: boolean;
  reveal: Reveal | null;
  similar?: SimilarRequest | null;
}

/** The players table with the profile of the selected player beside it. */
export function PlayerBrowser({ version, active, reveal, similar: similarRequest = null }: PlayerBrowserProps) {
  // The filters and the sort start as they were before the language was switched, if it was (see `restore.ts`).
  const [fields, setFields] = useState<PlayerFilterFields>(() => restored("playerFields", readFields));
  const best = useBestFor("playerBest", PLAYER_RECIPES);
  // A player asked for from elsewhere is found whatever the filters were: they are cleared for him.
  const [revealed, setRevealed] = useState(reveal);
  if (revealed !== reveal) {
    setRevealed(reveal);
    if (reveal) {
      setFields(NO_PLAYER_FILTERS);
      best.set("");
    }
  }
  // No order is asked for until a header is clicked: the search answers with the best current ability first, or
  // the best fit while the list is ranked.
  // The player the list is compared with: asked for from a profile, kept until the user stops comparing. A comparison
  // ranks the list as Best for does, so one replaces the other.
  const [similar, setSimilar] = useState<SimilarRequest | null>(similarRequest);
  const sort = useListSort(
    "playerOrder",
    { sorts: PLAYER_SORTS, start: DEFAULT_ORDER, firstAscending: FIRST_ASCENDING },
    best.recipe !== undefined || similar !== null,
  );
  const [requested, setRequested] = useState(similarRequest);
  if (requested !== similarRequest) {
    setRequested(similarRequest);
    if (similarRequest) {
      setSimilar(similarRequest);
      best.set("");
      // The most alike first, until a header is clicked.
      sort.set(null);
    }
  }
  const { order } = sort;
  useSnapshot("playerFields", () => fields);
  // The tab of the profile is kept here, so that the next player picked opens on the same one.
  const [tab, setTab] = useState<PlayerTab>(() => restored("playerTab", readPlayerTab));
  useSnapshot("playerTab", () => tab);
  // The players picked for a comparison. They are kept here, as the list is: every list stays mounted while another
  // view is shown (see `App`), so the set survives switching views.
  const comparison = useComparison();

  const filter = toPlayerFilter(fields);
  const filterCount = countFilters(filter);
  // Every role picked in the filters is a column; a sort by one whose column was taken away is no sort.
  const roles = toRoleBounds(fields.roles).map((bound) => bound.role);
  if (order?.by.startsWith(ROLE_SORT) && !roles.includes(order.by.slice(ROLE_SORT.length))) {
    sort.set(null);
  }
  // The columns the user chose to show, and the attributes that have a column.
  const [columns, setColumns] = usePlayerColumns();
  const shows = (column: PlayerColumn) => columns.columns.includes(column);
  const sortHeader = (by: ColumnSort, className?: string) => (
    <SortHeader<PlayerSort> by={by} sort={sort} label={text.columns[by]} name={text.sortNames[by]} className={className} />
  );
  /** What the list is sorted by, as the summary line says it. */
  const sortName = (by: PlayerSort) =>
    by.startsWith(ATTRIBUTE_SORT)
      ? attributeName(by.slice(ATTRIBUTE_SORT.length))
      : by.startsWith(ROLE_SORT)
        ? roleLabel(by.slice(ROLE_SORT.length))
        : text.sortNames[by as ColumnSort];
  /** The order the summary line names: the one asked for, or likeness while the list is compared. */
  const named = order ?? (similar ? null : undefined);
  const stopComparing = () => setSimilar(null);

  return (
    <ListBrowser<PlayerRow>
      name="players"
      command="search_players"
      requestArgs={{
        filter,
        order: order ?? undefined,
        best: best.recipe?.best,
        attributes: columns.attributes.length > 0 ? columns.attributes : undefined,
        similar: similar ? { uid: similar.uid, peak: similar.peak } : undefined,
        roles: roles.length > 0 ? roles : undefined,
      }}
      version={version}
      active={active}
      reveal={reveal}
      placeholder={text.search}
      summary={(total, shown) =>
        text.summary(
          total,
          shown,
          named === null
            ? { by: text.sortNames.similarity, ascending: false }
            : named === undefined
              ? null
              : { by: sortName(named.by), ascending: named.ascending },
        )
      }
      empty={(query) => text.empty(query, filterCount > 0)}
      filterBar={
        <>
          <PlayerFilterBar
            fields={fields}
            onChange={setFields}
            actions={
              <SavedFilterControls
                kind={PLAYER_SAVED}
                fields={fields}
                order={order}
                filtered={filterCount > 0}
                onApply={(savedFields, savedOrder) => {
                  setFields(savedFields);
                  sort.set(savedOrder);
                }}
              />
            }
          />
          {similar && (
            <SimilarBar
              similar={similar}
              onPeak={(peak) => setSimilar({ ...similar, peak })}
              onStop={stopComparing}
            />
          )}
        </>
      }
      toolbarActions={(list) => (
        <>
          <BestForSelect
            recipes={PLAYER_RECIPES}
            value={best.key}
            onChange={(key) => {
              best.set(key);
              sort.set(null);
              if (key !== "") {
                stopComparing();
              }
            }}
          />
          <YourBest yours={list.yours} />
          <MoreMenu>
            <ColumnsButton choice={columns} onChoose={setColumns} />
            <ExportButton list={list} filter={filter} order={order} />
            <MassEditButton entity="player" filters={{ playerFilter: filter }} list={list} />
            <PlayerTemplatesButton filters={{ playerFilter: filter }} list={list} />
          </MoreMenu>
        </>
      )}
      footer={<ComparisonTray comparison={comparison} />}
      tableClass="player-grid"
      header={
        <>
          {sortHeader("name", "col-name")}
          {similar && <LikeHeader sort={sort} />}
          {shows("age") && sortHeader("age", "num col-age")}
          {shows("positions") && <th className="col-positions">{text.columns.positions}</th>}
          {shows("nation") && sortHeader("nation", "col-nation")}
          {shows("club") && sortHeader("club", "col-club")}
          {shows("contractExpires") && sortHeader("contractExpires", "col-contract")}
          {shows("born") && <th className="col-born">{text.columns.born}</th>}
          {shows("value") && sortHeader("value", "num col-value")}
          {shows("wage") && sortHeader("wage", "num col-wage")}
          {shows("reputation") && sortHeader("reputation", "num col-rep")}
          {shows("development") && sortHeader("development", "num col-dev")}
          {shows("progress") && sortHeader("progress", "col-progress")}
          {columns.attributes.map((key) => (
            <SortHeader<PlayerSort>
              key={key}
              by={`${ATTRIBUTE_SORT}${key}`}
              sort={sort}
              label={attributeHeading(key)}
              name={attributeName(key)}
              className="num col-attribute"
            />
          ))}
          {roles.map((role) => (
            <SortHeader<PlayerSort>
              key={role}
              by={`${ROLE_SORT}${role}`}
              sort={sort}
              label={roleShort(role)}
              name={roleLabel(role)}
              className="num col-role"
            />
          ))}
          {best.recipe && <FitHeader sort={sort} />}
          {shows("currentAbility") && sortHeader("currentAbility", "num col-ca")}
          {shows("potentialAbility") && sortHeader("potentialAbility", "num col-pa")}
          {shows("uid") && <th className="num col-uid">{text.columns.uid}</th>}
        </>
      }
      cells={(p, list) => (
        <>
          {/* The hover text has what a long name, nation or club is cut to. */}
          <td className="col-name" title={p.fullName && p.fullName !== p.name ? `${p.name}\n${p.fullName}` : p.name}>
            <div className="name">{p.name}</div>
            {p.fullName && p.fullName !== p.name && <div className="sub">{p.fullName}</div>}
            {/* Shown instead of the Club column beside an open profile. */}
            <div className="sub row-club">{p.club ?? profileText.freeAgent}</div>
          </td>
          {similar && <td className="num col-like">{p.similarity ?? profileText.none}</td>}
          {shows("age") && <td className="num col-age">{p.age ?? profileText.none}</td>}
          {shows("positions") && <PositionsCell positions={p.positions} />}
          {shows("nation") && (
            <td className="col-nation" title={p.nation ?? undefined}>
              <WithPicture picture={<NationFlag uid={p.nationUid} />}>{p.nation ?? profileText.none}</WithPicture>
            </td>
          )}
          {shows("club") && (
            <td className="col-club" title={p.club ?? undefined}>
              <WithPicture picture={<ClubLogo uid={p.clubUid} name={p.club} size={PICTURE_SIZE.rowLogo} />}>
                {p.club ?? <span className="muted">{profileText.freeAgent}</span>}
              </WithPicture>
            </td>
          )}
          {shows("contractExpires") && (
            <td className="date col-contract">{formatDate(p.contractExpires) || profileText.none}</td>
          )}
          {shows("born") && <td className="date col-born">{formatDate(p.dateOfBirth)}</td>}
          {shows("value") && <td className="num col-value">{p.value === null ? profileText.none : formatMoney(p.value)}</td>}
          {shows("wage") && <td className="num col-wage">{p.wage === null ? profileText.none : formatMoney(p.wage)}</td>}
          {shows("reputation") && <td className="num col-rep">{formatNumber(p.currentReputation)}</td>}
          {shows("development") && (
            <td className="num col-dev">{p.development === null ? profileText.none : `${p.development}%`}</td>
          )}
          {shows("progress") && (
            <td className="col-progress">{p.progress === null ? profileText.none : <Stars halfStars={p.progress} />}</td>
          )}
          {columns.attributes.map((key) => (
            <td key={key} className="num col-attribute">
              {p.attributeValues?.[key] ?? profileText.none}
            </td>
          ))}
          {roles.map((role) => (
            <td key={role} className="num col-role">
              {p.roles[role] ?? profileText.none}
            </td>
          ))}
          {best.recipe && <FitCell recipe={best.recipe} fit={p.fit} yours={list.yours} />}
          {shows("currentAbility") && (
            <td className="num col-ca">
              <Ability value={p.currentAbility} />
            </td>
          )}
          {shows("potentialAbility") && (
            <td className="num col-pa">
              <Ability value={p.potentialAbility} />
            </td>
          )}
          {shows("uid") && <td className="num uid col-uid">{p.uid}</td>}
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

/** The header of the likeness column: the list is by likeness until another header is clicked, and this puts it back. */
function LikeHeader<Sort extends string>({ sort }: { sort: ListSort<Sort> }) {
  return (
    <th className="num col-like" aria-sort={sort.order === null ? "descending" : undefined}>
      <button type="button" className="sort" title={scoutText.columnTitles.similarity} onClick={() => sort.set(null)}>
        {text.columns.similarity}
        <svg className="sort-arrow" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M5 8.5v-7M2 4.5l3-3 3 3" />
        </svg>
      </button>
    </th>
  );
}

/** Over the list while it is compared with a player: whom with, today or at their peak, and the way out. */
function SimilarBar({
  similar,
  onPeak,
  onStop,
}: {
  similar: SimilarRequest;
  onPeak: (peak: boolean) => void;
  onStop: () => void;
}) {
  const words = scoutText.similar;
  return (
    <div className="similar-bar">
      <span className="similar-name">{words.like(similar.name)}</span>
      <div className="segmented" role="group" aria-label={words.when}>
        <button type="button" aria-pressed={!similar.peak} onClick={() => onPeak(false)}>
          {words.today}
        </button>
        <button type="button" aria-pressed={similar.peak} onClick={() => onPeak(true)}>
          {words.peak}
        </button>
      </div>
      <button type="button" className="bound-remove" aria-label={words.stop} title={words.stop} onClick={onStop}>
        ×
      </button>
    </div>
  );
}

/** The positions a player can play, best first: three at most, then an ellipsis; the hover text has all of them. */
function PositionsCell({ positions }: { positions: readonly string[] }) {
  if (positions.length === 0) {
    return <td className="col-positions muted">{profileText.none}</td>;
  }
  const labels = positions.map(positionLabel);
  return (
    <td className="col-positions" title={labels.join(" ")}>
      {labels.slice(0, POSITIONS_SHOWN).join(" ")}
      {labels.length > POSITIONS_SHOWN && " …"}
    </td>
  );
}
