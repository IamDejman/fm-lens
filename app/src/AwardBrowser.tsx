import { awardListText, editText, profileText } from "./labels";
import { ListBrowser } from "./ListBrowser";
import { NationFlag, WithPicture } from "./Picture";
import { Fact, ProfileFrame } from "./ProfileParts";
import type { AwardSummary } from "./types";

const text = awardListText;
const columns = text.columns;

/** The awards, most prestigious first, with the selected one beside the table. */
export function AwardBrowser({ version, active }: { version: number; active: boolean }) {
  return (
    <ListBrowser<AwardSummary>
      name="awards"
      command="search_awards"
      version={version}
      active={active}
      placeholder={text.search}
      summary={text.summary}
      empty={(query) => text.empty(query)}
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
        {award.name}
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
