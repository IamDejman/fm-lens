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
import { clubListText, clubProfileText, stadiumListText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import { Fact, ProfileFrame } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import type { StadiumClub, StadiumFilter, StadiumSummary } from "./types";

const columns = stadiumListText.columns;
const filters = stadiumListText.filters;
const CAPACITY_RANGE = { min: 0, max: 300_000 };

/** Senior stadiums, one row each with every club that plays there, with the selected stadium beside the table. */
export function StadiumBrowser({ version, active }: { version: number; active: boolean }) {
  const [kind, setKind] = useState(() => restored("stadiumKind", readKind));
  const [minCapacity, setMinCapacity] = useState(() => restored("stadiumMin", readText));
  const [maxCapacity, setMaxCapacity] = useState(() => restored("stadiumMax", readText));
  useSnapshot("stadiumKind", () => kind);
  useSnapshot("stadiumMin", () => minCapacity);
  useSnapshot("stadiumMax", () => maxCapacity);
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
      requestArgs={{ filter }}
      version={version}
      active={active}
      placeholder={stadiumListText.search}
      summary={stadiumListText.summary}
      empty={(query) => stadiumListText.empty(query, filter !== undefined)}
      filterBar={
        <FilterBar chips={chips} onClear={clearAll}>
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
          />
        </FilterBar>
      }
      tableClass="stadium-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="col-club">{columns.club}</th>
          <th className="num col-capacity">{columns.capacity}</th>
          <th className="num col-seating">{columns.seating}</th>
          <th className="num col-expansion">{columns.expansion}</th>
        </>
      }
      cells={(stadium) => <StadiumCells stadium={stadium} />}
      profile={(stadium, panel) => <StadiumProfile stadium={stadium} onClose={panel.onClose} />}
    />
  );
}

/** Clubs' names, a comma between them and a tag on each women's club. */
function ClubNames({ clubs }: { clubs: readonly StadiumClub[] }) {
  return clubs.map((club, index) => (
    <Fragment key={club.uid}>
      {index > 0 && ", "}
      {club.name}
      {club.women && <span className="tag women">{clubListText.women}</span>}
    </Fragment>
  ));
}

function StadiumCells({ stadium }: { stadium: StadiumSummary }) {
  const [club, ...others] = stadium.clubs;
  const name = stadium.name ?? club.name;
  return (
    <>
      <td className="col-name" title={name}>
        {name}
      </td>
      <td className="col-club" title={stadium.clubs.map((tenant) => tenant.name).join(", ")}>
        <WithPicture picture={<ClubLogo uid={club.uid} name={club.name} size={PICTURE_SIZE.rowLogo} />}>
          <span className="name-text">{club.name}</span>
          {club.women && <span className="tag women">{clubListText.women}</span>}
          {others.length > 0 && (
            <div className="sub">
              <ClubNames clubs={others} />
            </div>
          )}
        </WithPicture>
      </td>
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
      picture={<ClubLogo uid={club.uid} name={club.name} size={PICTURE_SIZE.clubLogo} />}
      name={stadium.name ?? club.name}
      fullName={null}
      vitals={[]}
      loaded={{ details: stadium }}
      onClose={onClose}
    >
      <dl className="stats">
        <Fact label={stadium.clubs.length > 1 ? stadiumListText.clubs : columns.club}>
          <ClubNames clubs={stadium.clubs} />
        </Fact>
        <Fact label={clubProfileText.capacity}>{formatNumber(stadium.capacity)}</Fact>
        <Fact label={clubProfileText.seating}>{formatNumber(stadium.seating)}</Fact>
        <Fact label={clubProfileText.used} title={clubProfileText.usedTitle}>
          {stadium.used === 0 ? clubProfileText.usedAll : formatNumber(stadium.used)}
        </Fact>
        <Fact label={clubProfileText.expansion}>{formatNumber(stadium.expansion)}</Fact>
      </dl>
    </ProfileFrame>
  );
}
