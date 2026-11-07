import { useId, useState } from "react";
import { formatNumber } from "./format";
import { clubListText, clubProfileText, stadiumListText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { ClubLogo, PICTURE_SIZE, WithPicture } from "./Picture";
import { Fact, ProfileFrame } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import type { StadiumFilter, StadiumSummary } from "./types";

const columns = stadiumListText.columns;
const filters = stadiumListText.filters;
const CAPACITY_RANGE = { min: 0, max: 300_000 };

/** A whole number within `range`; nothing for an empty or unreadable input. */
function whole(input: string, range: { min: number; max: number }): number | undefined {
  if (input.trim() === "") {
    return undefined;
  }
  const value = Number(input);
  return Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, Math.round(value))) : undefined;
}

const readText = (value: unknown) => (typeof value === "string" ? value : "");

/** Senior stadiums, one per club, with the selected stadium beside the table. */
export function StadiumBrowser({ version, active }: { version: number; active: boolean }) {
  const [minCapacity, setMinCapacity] = useState(() => restored("stadiumMin", readText));
  const [maxCapacity, setMaxCapacity] = useState(() => restored("stadiumMax", readText));
  useSnapshot("stadiumMin", () => minCapacity);
  useSnapshot("stadiumMax", () => maxCapacity);
  const min = whole(minCapacity, CAPACITY_RANGE);
  const max = whole(maxCapacity, CAPACITY_RANGE);
  const filter: StadiumFilter | undefined =
    min === undefined && max === undefined ? undefined : { minCapacity: min, maxCapacity: max };
  const capacityLabel = useId();

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
        <div className="filter-bar">
          <div className="filter-fields">
            <div className="filter-field" role="group" aria-labelledby={capacityLabel}>
              <span id={capacityLabel}>{filters.capacity}</span>
              <input
                type="number"
                min={CAPACITY_RANGE.min}
                max={CAPACITY_RANGE.max}
                step={1}
                placeholder={filters.minPlaceholder}
                aria-label={filters.minCapacity}
                value={minCapacity}
                onChange={(e) => setMinCapacity(e.currentTarget.value)}
              />
              <span aria-hidden="true">–</span>
              <input
                type="number"
                min={CAPACITY_RANGE.min}
                max={CAPACITY_RANGE.max}
                step={1}
                placeholder={filters.maxPlaceholder}
                aria-label={filters.maxCapacity}
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.currentTarget.value)}
              />
            </div>
          </div>
        </div>
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

function StadiumCells({ stadium }: { stadium: StadiumSummary }) {
  const name = stadium.name ?? stadium.club;
  return (
    <>
      <td className="col-name" title={name}>
        {name}
      </td>
      <td className="col-club" title={stadium.club}>
        <WithPicture picture={<ClubLogo uid={stadium.clubUid} name={stadium.club} size={PICTURE_SIZE.rowLogo} />}>
          <span className="name-text">{stadium.club}</span>
          {stadium.women && <span className="tag women">{clubListText.women}</span>}
        </WithPicture>
      </td>
      <td className="num">{formatNumber(stadium.capacity)}</td>
      <td className="num">{formatNumber(stadium.seating)}</td>
      <td className="num">{formatNumber(stadium.expansion)}</td>
    </>
  );
}

function StadiumProfile({ stadium, onClose }: { stadium: StadiumSummary; onClose: () => void }) {
  const name = stadium.name ?? stadium.club;
  return (
    <ProfileFrame
      picture={<ClubLogo uid={stadium.clubUid} name={stadium.club} size={PICTURE_SIZE.clubLogo} />}
      name={name}
      fullName={stadium.name && stadium.name !== stadium.club ? stadium.club : null}
      vitals={[]}
      loaded={{ details: stadium }}
      onClose={onClose}
    >
      <dl className="stats">
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
