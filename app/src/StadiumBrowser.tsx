import { Fragment, useState } from "react";
import {
  chipLabel,
  FilterBar,
  type FilterChip,
  KindField,
  kindChip,
  RangeField,
  rangeText,
  readKind,
  readText,
  whole,
  womenOnly,
} from "./FilterBar";
import { formatNumber } from "./format";
import { clubListText, clubProfileText, profileText, stadiumListText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import { Fact, ProfileFrame } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import { SavedFilterControls } from "./SavedFilterControls";
import { readPlain, savedKind } from "./savedFilters";
import { SortHeader, useListSort, type SortStart } from "./SortHeader";
import type { ListOrder, StadiumClub, StadiumFilter, StadiumSort, StadiumSummary } from "./types";

const columns = stadiumListText.columns;
const filters = stadiumListText.filters;
const CAPACITY_RANGE = { min: 0, max: 300_000 };

/** The columns the list sorts by. Until one is clicked the search answers with the largest first. */
const SORT: SortStart<StadiumSort> = {
  sorts: ["name", "capacity", "seating", "expansion"],
  start: { by: "capacity", ascending: false },
  firstAscending: ["name"],
};

/** The inputs of the filter bar, empty: what a saved filter holds. */
const NO_FIELDS = { kind: "all", minCapacity: "", maxCapacity: "" };
type StadiumFields = typeof NO_FIELDS;

const SAVED = savedKind<StadiumFields, StadiumSort>("stadiums", (value) => readPlain(value, NO_FIELDS), SORT.sorts);

/**
 * Stadiums, one row each with every club whose senior team plays there, then, where the build places the game's table
 * of them, every other stadium; the selected stadium beside the table.
 */
export function StadiumBrowser({ version, active }: { version: number; active: boolean }) {
  const [kind, setKind] = useState(() => restored("stadiumKind", readKind));
  const [minCapacity, setMinCapacity] = useState(() => restored("stadiumMin", readText));
  const [maxCapacity, setMaxCapacity] = useState(() => restored("stadiumMax", readText));
  useSnapshot("stadiumKind", () => kind);
  useSnapshot("stadiumMin", () => minCapacity);
  useSnapshot("stadiumMax", () => maxCapacity);
  const sort = useListSort("stadiumOrder", SORT);
  // What a saved filter keeps of the bar, and how one is brought back.
  const fields: StadiumFields = { kind, minCapacity, maxCapacity };
  const applySaved = (saved: StadiumFields, order: ListOrder<StadiumSort> | null) => {
    setKind(readKind(saved.kind));
    setMinCapacity(saved.minCapacity);
    setMaxCapacity(saved.maxCapacity);
    sort.set(order);
  };
  const min = whole(minCapacity, CAPACITY_RANGE);
  const max = whole(maxCapacity, CAPACITY_RANGE);
  const filter: StadiumFilter | undefined =
    kind === "all" && min === undefined && max === undefined
      ? undefined
      : { women: womenOnly(kind), minCapacity: min, maxCapacity: max };
  const capacity = rangeText(min, max, formatNumber);
  const clearCapacity = () => {
    setMinCapacity("");
    setMaxCapacity("");
  };
  const clearAll = () => {
    setKind("all");
    clearCapacity();
  };
  const chips: FilterChip[] = kindChip(kind, filters, () => setKind("all"));
  if (capacity !== null) {
    chips.push({ key: "capacity", label: chipLabel(filters.capacity, capacity), remove: clearCapacity });
  }

  return (
    <ListBrowser<StadiumSummary>
      name="stadiums"
      command="search_stadiums"
      requestArgs={{ filter, order: sort.order ?? undefined }}
      version={version}
      active={active}
      placeholder={stadiumListText.search}
      summary={stadiumListText.summary}
      empty={(query) => stadiumListText.empty(query, filter !== undefined)}
      filterBar={
        <FilterBar
          chips={chips}
          onClear={clearAll}
          actions={
            <SavedFilterControls
              kind={SAVED}
              fields={fields}
              order={sort.order}
              filtered={chips.length > 0}
              onApply={applySaved}
            />
          }
        >
          <KindField labels={filters} value={kind} onChange={setKind} />
          <RangeField
            label={filters.capacity}
            minLabel={filters.minCapacity}
            maxLabel={filters.maxCapacity}
            range={CAPACITY_RANGE}
            min={minCapacity}
            max={maxCapacity}
            onMin={setMinCapacity}
            onMax={setMaxCapacity}
            wide
          />
        </FilterBar>
      }
      tableClass="stadium-grid"
      header={
        <>
          <SortHeader by="name" sort={sort} label={columns.name} className="col-name" />
          <th className="col-club">{columns.club}</th>
          <SortHeader by="capacity" sort={sort} label={columns.capacity} className="num col-capacity" />
          <SortHeader by="seating" sort={sort} label={columns.seating} className="num col-seating" />
          <SortHeader by="expansion" sort={sort} label={columns.expansion} className="num col-expansion" />
        </>
      }
      cells={(stadium) => <StadiumCells stadium={stadium} />}
      profile={(stadium, panel) => <StadiumProfile stadium={stadium} onClose={panel.onClose} />}
    />
  );
}

/**
 * Clubs' names, a comma between them and a tag on each women's club. Each club is its own span, so a row wraps
 * between clubs and never parts a club from its tag. The comma goes with the name, or after the tag, so a name cut
 * short leaves no gap before it.
 */
function ClubNames({ clubs }: { clubs: readonly StadiumClub[] }) {
  return clubs.map((club, index) => {
    const comma = index < clubs.length - 1 ? "," : null;
    return (
      <Fragment key={club.uid}>
        {index > 0 && " "}
        <span className="club">
          <span className="name-text">
            {club.name}
            {!club.women && comma}
          </span>
          {club.women && (
            <>
              <span className="tag women">{clubListText.women}</span>
              {comma}
            </>
          )}
        </span>
      </Fragment>
    );
  });
}

/** A club's name for a cell's hover, which has no tags: "Club América (Women)". */
const clubTitle = (club: StadiumClub) => (club.women ? `${club.name} (${clubListText.women})` : club.name);

/** A stadium's name: its own, or else that of the first club that plays there. */
const stadiumName = (stadium: StadiumSummary) => stadium.name ?? stadium.clubs[0]?.name ?? profileText.none;

function StadiumCells({ stadium }: { stadium: StadiumSummary }) {
  const [club, ...others] = stadium.clubs;
  const name = stadiumName(stadium);
  return (
    <>
      <td className="col-name" title={name}>
        {name}
      </td>
      {club === undefined ? (
        <td className="col-club muted">{profileText.none}</td>
      ) : (
        <td className="col-club" title={stadium.clubs.map(clubTitle).join(", ")}>
          <WithPicture picture={<ClubLogo uid={club.uid} name={club.name} size={PICTURE_SIZE.rowLogo} />}>
            <div className="club-line">
              <span className="name-text">{club.name}</span>
              {club.women && <span className="tag women">{clubListText.women}</span>}
            </div>
            {others.length > 0 && (
              <div className="sub">
                <ClubNames clubs={others} />
              </div>
            )}
          </WithPicture>
        </td>
      )}
      <td className="num">{formatNumber(stadium.capacity)}</td>
      <td className="num">{formatNumber(stadium.seating)}</td>
      <td className="num">{formatNumber(stadium.expansion)}</td>
    </>
  );
}

function StadiumProfile({ stadium, onClose }: { stadium: StadiumSummary; onClose: () => void }) {
  const [club] = stadium.clubs;
  return (
    <ProfileFrame
      picture={club && <ClubLogo uid={club.uid} name={club.name} size={PICTURE_SIZE.clubLogo} />}
      name={stadiumName(stadium)}
      fullName={null}
      vitals={[]}
      loaded={{ details: stadium }}
      onClose={onClose}
    >
      <dl className="stats stadium-stats">
        <Fact label={stadium.clubs.length > 1 ? stadiumListText.clubs : columns.club}>
          {club ? <ClubNames clubs={stadium.clubs} /> : profileText.none}
        </Fact>
        <Fact label={clubProfileText.capacity}>{formatNumber(stadium.capacity)}</Fact>
        <Fact label={clubProfileText.seating}>{formatNumber(stadium.seating)}</Fact>
        <Fact label={clubProfileText.used} title={clubProfileText.usedTitle}>
          {stadium.used === 0 ? clubProfileText.usedAll : formatNumber(stadium.used)}
        </Fact>
        <Fact label={clubProfileText.expansion}>{formatNumber(stadium.expansion)}</Fact>
        {stadium.owner && (
          <Fact label={clubProfileText.owner}>
            <ClubNames clubs={[stadium.owner]} />
          </Fact>
        )}
      </dl>
    </ProfileFrame>
  );
}
