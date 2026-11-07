import { formatNumber } from "./format";
import { competitionListText, editText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { NationFlag, WithPicture } from "./Picture";
import { Fact, useProfileDetails } from "./ProfileParts";
import type { CompetitionRule, CompetitionSummary } from "./types";

const text = competitionListText;
const columns = text.columns;

/**
 * The competitions, highest reputation first. A row holds all FM Lens knows of a competition but its short name and
 * its rules: those open under it, and the table keeps its whole width.
 */
export function CompetitionBrowser({ version, active }: { version: number; active: boolean }) {
  return (
    <ListBrowser<CompetitionSummary>
      name="competitions"
      command="search_competitions"
      version={version}
      active={active}
      placeholder={text.search}
      summary={text.summary}
      empty={(query) => text.empty(query)}
      tableClass="competition-grid"
      header={
        <>
          <th className="col-name">{columns.name}</th>
          <th className="col-nation">{columns.nation}</th>
          <th className="col-continent">{columns.continent}</th>
          <th className="num col-rep">{columns.reputation}</th>
          <th className="num col-uid">{columns.uid}</th>
        </>
      }
      cells={(competition) => <CompetitionCells competition={competition} />}
      detail={(competition) => <CompetitionDetail competition={competition} version={version} />}
    />
  );
}

function CompetitionCells({ competition }: { competition: CompetitionSummary }) {
  return (
    <>
      <td className="col-name" title={competition.name}>
        <span className="name">
          <span className="name-text">{competition.name}</span>
          {competition.women && <span className="tag women">{text.women}</span>}
        </span>
      </td>
      <td className="col-nation" title={competition.nation ?? undefined}>
        {competition.nation === null ? (
          profileText.none
        ) : (
          <WithPicture picture={<NationFlag uid={competition.nationUid} />}>{competition.nation}</WithPicture>
        )}
      </td>
      <td className="col-continent">{competition.continent ?? profileText.none}</td>
      <td className="num col-rep">{formatNumber(competition.reputation)}</td>
      <td className="num uid col-uid">{competition.uid}</td>
    </>
  );
}

const ruleNames: Record<string, string> = text.ruleNames;

/**
 * Under a competition's row: its short name where it differs, and the rules FM keeps as plain numbers and yes-or-no
 * values, or a hyphen where it has none to show.
 */
function CompetitionDetail({ competition, version }: { competition: CompetitionSummary; version: number }) {
  const loaded = useProfileDetails<CompetitionRule[] | null>("competition_rules", competition.uid, version);
  if (loaded?.error !== undefined) {
    return <p className="note">{loaded.error}</p>;
  }
  const rules = loaded?.details ?? [];
  const shortName = competition.shortName !== competition.name ? competition.shortName : null;
  return (
    <dl className="stats" aria-busy={loaded === null || undefined}>
      {shortName && <Fact label={text.shortName}>{shortName}</Fact>}
      {loaded !== null && rules.length === 0 && <Fact label={text.rules}>{profileText.none}</Fact>}
      {rules.map((rule) => (
        <Fact key={rule.key} label={ruleNames[rule.key] ?? rule.key}>
          {typeof rule.value === "boolean" ? (rule.value ? editText.yes : editText.no) : formatNumber(rule.value)}
        </Fact>
      ))}
    </dl>
  );
}
