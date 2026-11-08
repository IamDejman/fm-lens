import { useState } from "react";
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
import { awardListText, editText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { NationFlag, WithPicture } from "./Picture";
import { Fact, ProfileFrame } from "./ProfileParts";
import { restored, useSnapshot } from "./restore";
import type { AwardFilter, AwardSummary } from "./types";

const text = awardListText;
const columns = text.columns;
const filters = text.filters;
const PRESTIGE_RANGE = { min: 0, max: 20 };
/** FM's codes for who gets an award that the given-to select offers: a player, a manager, a team of players. */
const RECIPIENTS = [1, 2, 7];

/** The given-to filter saved before the language was switched: a code the select offers, or "" for anyone. */
const readRecipients = (value: unknown) =>
  typeof value === "string" && RECIPIENTS.some((code) => String(code) === value) ? value : "";

/** The awards, most prestigious first, with the selected one beside the table. */
export function AwardBrowser({ version, active }: { version: number; active: boolean }) {
  // The filters start as they were before the language was switched, if it was (see `restore.ts`).
  const [kind, setKind] = useState(() => restored("awardKind", readKind));
  const [nation, setNation] = useState(() => restored("awardNation", readText));
  // Who gets it as the select holds it: FM's code, or "" for anyone.
  const [recipients, setRecipients] = useState(() => restored("awardRecipients", readRecipients));
  const [minPrestige, setMinPrestige] = useState(() => restored("awardMinPrestige", readText));
  const [maxPrestige, setMaxPrestige] = useState(() => restored("awardMaxPrestige", readText));
  useSnapshot("awardKind", () => kind);
  useSnapshot("awardNation", () => nation);
  useSnapshot("awardRecipients", () => recipients);
  useSnapshot("awardMinPrestige", () => minPrestige);
  useSnapshot("awardMaxPrestige", () => maxPrestige);
  const nationValue = nation.trim() || undefined;
  const minValue = whole(minPrestige, PRESTIGE_RANGE);
  const maxValue = whole(maxPrestige, PRESTIGE_RANGE);
  const filter: AwardFilter | undefined =
    kind === "all" && nationValue === undefined && recipients === "" && minValue === undefined && maxValue === undefined
      ? undefined
      : {
          women: womenOnly(kind),
          nation: nationValue,
          recipients: recipients === "" ? undefined : Number(recipients),
          minPrestige: minValue,
          maxPrestige: maxValue,
        };

  // A chip for each filter in effect; the two ends of the prestige range are one.
  const chips: FilterChip[] = kindChip(kind, filters, () => setKind("all"));
  const prestige = rangeText(minValue, maxValue);
  if (nationValue !== undefined) {
    chips.push({ key: "nation", label: chipLabel(filters.nation, nationValue), remove: () => setNation("") });
  }
  if (recipients !== "") {
    chips.push({
      key: "recipients",
      label: chipLabel(filters.recipients, text.recipientName(Number(recipients)) ?? recipients),
      remove: () => setRecipients(""),
    });
  }
  if (prestige !== null) {
    chips.push({
      key: "prestige",
      label: chipLabel(filters.prestige, prestige),
      remove: () => {
        setMinPrestige("");
        setMaxPrestige("");
      },
    });
  }
  const clearAll = () => {
    setKind("all");
    setNation("");
    setRecipients("");
    setMinPrestige("");
    setMaxPrestige("");
  };

  return (
    <ListBrowser<AwardSummary>
      name="awards"
      command="search_awards"
      requestArgs={{ filter }}
      version={version}
      active={active}
      placeholder={text.search}
      summary={text.summary}
      empty={(query) => text.empty(query, filter !== undefined)}
      filterBar={
        <FilterBar chips={chips} onClear={clearAll}>
          <KindField labels={filters} value={kind} onChange={setKind} />
          <label className="filter-field">
            <span>{filters.nation}</span>
            <input
              value={nation}
              onChange={(e) => setNation(e.currentTarget.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="filter-field">
            <span>{filters.recipients}</span>
            <select value={recipients} onChange={(e) => setRecipients(e.currentTarget.value)}>
              <option value="">{filters.anyone}</option>
              {RECIPIENTS.map((code) => (
                <option key={code} value={code}>
                  {text.recipientName(code)}
                </option>
              ))}
            </select>
          </label>
          <RangeField
            label={filters.prestige}
            minLabel={filters.minPrestige}
            maxLabel={filters.maxPrestige}
            range={PRESTIGE_RANGE}
            min={minPrestige}
            max={maxPrestige}
            onMin={setMinPrestige}
            onMax={setMaxPrestige}
          />
        </FilterBar>
      }
      tableClass="award-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="col-competition">{columns.competition}</th>
          <th className="col-nation">{columns.nation}</th>
          <th className="num col-prestige">{columns.prestige}</th>
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(award) => <AwardCells award={award} />}
      profile={(award, panel) => <AwardProfile award={award} onClose={panel.onClose} />}
    />
  );
}

function AwardCells({ award }: { award: AwardSummary }) {
  return (
    <>
      <td className="col-name" title={award.name}>
        <span className="name">
          <span className="name-text">{award.name}</span>
          {award.women && <span className="tag women">{text.women}</span>}
        </span>
      </td>
      <td className="col-competition" title={award.competition ?? undefined}>
        {award.competition ?? profileText.none}
      </td>
      <td className="col-nation" title={award.nation ?? undefined}>
        {award.nation === null ? (
          profileText.none
        ) : (
          <WithPicture picture={<NationFlag uid={award.nationUid} />}>{award.nation}</WithPicture>
        )}
      </td>
      <td className="num col-prestige">{award.prestige}</td>
      <td className="num uid col-uid">{award.uid}</td>
    </>
  );
}

/** An award's profile: where it is given, how often, to whom, and who may win it. */
function AwardProfile({ award, onClose }: { award: AwardSummary; onClose: () => void }) {
  const period = text.periodName(award.period);
  const recipients = text.recipientName(award.recipients);
  return (
    <ProfileFrame
      name={award.name}
      fullName={null}
      badge={award.women ? <span className="tag women">{text.women}</span> : undefined}
      meta={[award.nation, award.continent].filter(Boolean).join(", ") || undefined}
      vitals={[`${profileText.uid} ${award.uid}`]}
      loaded={{ details: award }}
      onClose={onClose}
    >
      <dl className="stats">
        <Fact label={text.prestige}>{award.prestige}</Fact>
        <Fact label={text.competition}>{award.competition ?? profileText.none}</Fact>
        {period !== null && <Fact label={text.period}>{period}</Fact>}
        {recipients !== null && <Fact label={text.recipients}>{recipients}</Fact>}
        {award.goalkeepersOnly && <Fact label={text.goalkeepersOnly}>{editText.yes}</Fact>}
        <Fact label={text.ageLimit}>{award.maxAge === null ? profileText.none : text.ageLimitValue(award.maxAge)}</Fact>
      </dl>
    </ProfileFrame>
  );
}
