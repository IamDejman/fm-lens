import { beforeEach, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { ABILITY_ATTRIBUTES, ABILITY_POSITIONS, abilityFor, fittedAbility, ownAbility, suggestedAbility } from '../src/abilityEstimate';
import { keptOwnAbility } from '../src/abilityMemory';
import { inputState, type Typed } from '../src/editDraft';
import { valuesBefore } from '../src/editing';
import { SuggestedAbility } from '../src/SuggestedAbility';
import { EditHistoryContext, SessionContext, type EditSession } from '../src/useProfileEditing';
import type { EditField, LoggedChange } from '../src/types';

// One player of each role as a save held him, no names: the ability the game gave him, his attributes as stored
// (0-100, in the order of ABILITY_ATTRIBUTES) and his position ratings (in the order of ABILITY_POSITIONS).
const PLAYERS = [
  { role: 'gk', ability: 129, raw: [20,15,10,15,57,38,5,5,10,5,63,5,15,40,62,60,75,59,56,40,10,70,65,36,55,59,67,52,70,47,59,50,65,54,70,70,67,67,81,60,60,100], ratings: [20,1,1,1,1,1,1,1,1,1,1,1,1,1] },
  { role: 'dc', ability: 129, raw: [19,50,50,25,62,30,71,24,64,71,60,36,70,62,65,70,64,70,54,55,34,66,59,41,64,66,59,70,79,65,71,76,5,5,20,5,10,15,5,5,40,100], ratings: [1,20,1,1,1,1,1,1,1,1,1,1,1,1] },
  { role: 'fb', ability: 127, raw: [31,59,54,46,61,31,64,44,38,64,61,55,63,61,67,61,65,71,61,22,46,64,64,63,64,64,62,61,70,72,66,67,10,10,15,5,5,10,10,5,40,100], ratings: [1,20,1,18,1,17,1,1,1,15,1,1,1,1] },
  { role: 'wb', ability: 128, raw: [29,69,61,47,61,29,37,42,46,56,53,37,61,56,64,70,48,60,59,42,61,69,62,61,70,76,66,50,38,72,66,55,20,10,5,5,15,10,20,5,55,100], ratings: [1,1,16,20,1,17,1,1,1,17,1,12,1,1] },
  { role: 'dm', ability: 128, raw: [36,50,53,50,60,35,40,50,25,65,60,45,70,60,76,75,61,65,61,65,60,70,81,62,80,65,65,60,34,65,85,60,10,5,15,5,10,5,10,10,40,100], ratings: [1,9,8,13,9,11,20,17,13,12,1,8,1,1] },
  { role: 'mc', ability: 129, raw: [70,50,64,34,69,65,45,69,25,61,80,34,60,74,68,70,69,68,65,75,65,60,69,74,73,43,51,46,53,62,64,65,10,10,5,10,15,15,5,15,100,50], ratings: [1,1,1,1,1,1,15,20,1,1,1,1,18,1] },
  { role: 'wm', ability: 128, raw: [63,80,68,46,66,65,44,73,47,61,69,74,61,70,61,65,70,61,61,60,64,52,65,59,59,64,62,63,49,63,63,48,5,5,15,10,15,10,10,5,100,35], ratings: [1,1,19,1,20,2,12,15,15,1,11,1,1,1] },
  { role: 'w', ability: 130, raw: [20,44,78,43,75,25,29,38,10,33,58,33,13,82,55,24,59,49,58,18,51,35,41,63,64,71,82,79,36,76,61,57,15,15,5,10,15,5,5,15,75,100], ratings: [1,1,1,1,1,1,1,1,1,1,17,20,10,15] },
  { role: 'amc', ability: 130, raw: [76,74,72,66,74,69,56,60,41,46,78,66,35,76,70,61,64,67,66,48,76,58,69,75,75,61,69,65,44,55,58,52,5,5,15,15,5,15,5,15,40,100], ratings: [1,1,1,1,1,1,1,14,14,14,15,15,20,5] },
  { role: 'st', ability: 128, raw: [34,47,69,78,59,40,60,44,39,30,64,40,28,73,74,60,69,69,69,40,76,39,60,74,61,65,60,54,57,67,46,50,15,20,15,15,15,20,5,5,100,60], ratings: [1,1,1,1,1,1,1,1,1,1,10,15,15,20] },
];

const named = (keys: readonly string[], values: readonly number[]) => Object.fromEntries(keys.map((key, i) => [key, values[i]]));
const player = (role: string) => {
  const found = PLAYERS.find((one) => one.role === role)!;
  return {
    ability: found.ability,
    raw: named(ABILITY_ATTRIBUTES, found.raw),
    attributes: named(ABILITY_ATTRIBUTES, found.raw.map((raw) => raw / 5)),
    positions: named(ABILITY_POSITIONS, found.ratings),
  };
};

// Of all players, 84 in 100 are within 2 (see the fit in `abilityEstimate.ts`); these ten are within 2.5.
test('the estimate lands on the ability the game holds, for every role', () => {
  for (const { role } of PLAYERS) {
    const { ability, attributes, positions } = player(role);
    expect(Math.abs(abilityFor(attributes, positions)! - ability), role).toBeLessThan(2.5);
  }
});

test('a player nothing was changed on is suggested the ability he has', () => {
  for (const { role } of PLAYERS) {
    const { ability, attributes, positions } = player(role);
    expect(suggestedAbility(ability, { attributes, positions }, { attributes, positions }), role).toBe(ability);
  }
});

test('an edit moves the ability by what it is worth in his role', () => {
  const { ability, attributes, positions } = player('st');
  const sharper = { attributes: { ...attributes, finishing: attributes.finishing + 2 }, positions };
  expect(suggestedAbility(ability, { attributes, positions }, sharper)).toBe(ability + 3);
  // Determination costs nothing, and a goalkeeping attribute nothing to a striker.
  const keen = { attributes: { ...attributes, determination: 20, handling: 20 }, positions };
  expect(suggestedAbility(ability, { attributes, positions }, keen)).toBe(ability);
});

test('a position counts by its rating, and the dearest of them sets the ability', () => {
  const { attributes } = player('st');
  const striker = abilityFor(attributes, { st: 20 })!;
  // In full from 18, less below it, as FM's own editor weighs a position.
  expect(abilityFor(attributes, { st: 18 })).toBe(striker);
  expect(abilityFor(attributes, { st: 15 })).toBeCloseTo(striker * 0.96, 5);
  expect(abilityFor(attributes, { st: 10 })).toBeCloseTo(striker * 0.802, 5);
  expect(abilityFor(attributes, { st: 20, dc: 14 })).toBe(striker);
  expect(abilityFor(attributes, { st: 1, dc: 20 })).toBeLessThan(striker);
  // A position he half plays can be the dearest: his own at 10 is worth less than a winger's at 20.
  expect(abilityFor(attributes, { st: 10, aml: 20 })).toBe(abilityFor(attributes, { aml: 20 }));
  // Each position played, from 15, adds for the versatility: nothing for two, a point for three.
  expect(abilityFor(attributes, { st: 20, dc: 20 })).toBe(striker);
  expect(abilityFor(attributes, { st: 20, dc: 15, gk: 15 })).toBeCloseTo(striker + 1.1, 5);
});

test('the ability that fits is not held to what the game holds, the suggestion is', () => {
  const { ability, attributes, positions } = player('st');
  const best = named(ABILITY_ATTRIBUTES, ABILITY_ATTRIBUTES.map(() => 20));
  expect(fittedAbility(ability, { attributes, positions }, { attributes: best, positions })).toBeGreaterThan(200);
  expect(suggestedAbility(ability, { attributes, positions }, { attributes: best, positions })).toBe(200);
});

test('an ability that does not fit is suggested the estimate, within 1 to 200', () => {
  const { attributes, positions } = player('mc');
  const fit = Math.round(abilityFor(attributes, positions)!);
  expect(suggestedAbility(60, { attributes, positions }, { attributes, positions })).toBe(fit);
  const best = named(ABILITY_ATTRIBUTES, ABILITY_ATTRIBUTES.map(() => 20));
  const worst = named(ABILITY_ATTRIBUTES, ABILITY_ATTRIBUTES.map(() => 1));
  expect(suggestedAbility(fit, { attributes, positions }, { attributes: best, positions })).toBe(200);
  expect(suggestedAbility(fit, { attributes, positions }, { attributes: worst, positions })).toBe(1);
  expect(suggestedAbility(fit, { attributes, positions: {} }, { attributes, positions: {} })).toBeNull();
});

const field = (key: string, kind: EditField['kind'], min: number, max: number, scale: EditField['scale'] = 'plain'): EditField =>
  ({ key, entity: 'player', kind, scale, min, max, blank: null, choices: null, mass: true });

const STRIKER = 7;
const CAREER = 'Steam:2000000001';
// What a point of finishing is worth to a striker.
const FINISHING = 1.53;
beforeEach(() => { localStorage.clear(); });

// The striker being edited: the inputs judge what is typed as the profile's do. `log` is what was applied to him
// before, newest first: he then holds what it wrote. It is the change log too, unless FM Lens was opened again since
// (`reopened`). Apply only makes the inputs wait, as while the changes are written.
function Editing({ potential, log = [], reopened = false, career = CAREER, best = false }: { potential: number; log?: LoggedChange[]; reopened?: boolean; career?: string | null; best?: boolean }) {
  const { ability: own, raw: made, positions } = player('st');
  // `best`: every attribute as high as it goes.
  const game = useMemo(() => (best ? Object.fromEntries(Object.keys(made).map((key) => [key, 100])) : made), [best, made]);
  const holds = (key: string, stored: number) => log.find((change) => change.field === key)?.new ?? stored;
  const ability = holds('current_ability', own);
  const raw = Object.fromEntries(Object.entries(game).map(([key, value]) => [key, holds(`attribute.${key}`, value)]));
  const [typed, setTyped] = useState<Typed>({});
  const [busy, setBusy] = useState(false);
  const details = useMemo(() => ({
    uid: STRIKER,
    attributes: Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, { raw: value, value: Math.floor((value + 2) / 5) }])),
    positionRatings: positions,
  }), [raw, positions]);
  const session = useMemo<EditSession>(() => {
    const fields = new Map<string, [EditField, number]>([
      ['current_ability', [field('current_ability', 'u16', 1, 200), ability]],
      ['potential_ability', [field('potential_ability', 'i16', 1, 200), potential]],
      ...Object.entries(raw).map(([key, value]): [string, [EditField, number]] =>
        [`attribute.${key}`, [field(`attribute.${key}`, 'u8', 1, 100, 'attribute'), value]]),
      ...Object.entries(positions).map(([key, value]): [string, [EditField, number]] =>
        [`position.${key}`, [field(`position.${key}`, 'u8', 1, 20), value]]),
    ]);
    return {
      entity: 'player',
      busy,
      has: (key) => fields.has(key),
      input: (key) => {
        const found = fields.get(key);
        return found ? inputState(found[0], found[1], typed[key], undefined) : null;
      },
      type: (key, text) => setTyped((old) => ({ ...old, [key]: text })),
    };
  }, [ability, potential, raw, positions, typed, busy]);
  return <EditHistoryContext.Provider value={{ career, before: valuesBefore(reopened ? [] : log) }}><SessionContext.Provider value={session}>
    <SuggestedAbility details={details} />
    {['current_ability', 'potential_ability', 'attribute.finishing', 'position.dc'].map((key) =>
      <input key={key} aria-label={key} value={session.input(key)?.text ?? ''} onChange={(e) => session.type(key, e.target.value)} />)}
    <button onClick={() => setBusy(true)}>Apply</button>
  </SessionContext.Provider></EditHistoryContext.Provider>;
}

const type = async (label: string, value: string) => {
  const input = screen.getByRole('textbox', { name: label });
  await userEvent.clear(input);
  await userEvent.type(input, value);
};
const held = (label: string) => (screen.getByRole('textbox', { name: label }) as HTMLInputElement).value;

test('raising an attribute raises the ability with it, and typing it back puts the ability back', async () => {
  const { ability, attributes } = player('st');
  render(<Editing potential={190} />);
  expect(screen.queryByRole('button', { name: /Suggested/ })).toBeNull();
  await type('attribute.finishing', '20');
  const suggested = ability + Math.round((20 - attributes.finishing) * FINISHING);
  expect(held('current_ability')).toBe(String(suggested));
  expect(held('potential_ability')).toBe('190');
  expect(screen.queryByRole('button', { name: /Suggested/ })).toBeNull();
  await type('attribute.finishing', String(Math.floor(attributes.finishing + 0.4)));
  expect(held('current_ability')).toBe(String(ability));
  expect(screen.queryByRole('button', { name: /Suggested/ })).toBeNull();
});

test('a lower suggestion waits for its button, and puts the ability in the input', async () => {
  const { ability } = player('st');
  render(<Editing potential={190} />);
  await type('attribute.finishing', '5');
  expect(held('current_ability')).toBe(String(ability));
  await userEvent.click(screen.getByRole('button', { name: /Suggested/ }));
  expect(Number(held('current_ability'))).toBeLessThan(ability);
  expect(screen.queryByRole('button', { name: /Suggested/ })).toBeNull();
});

test('an ability typed in is left as typed', async () => {
  const { ability, attributes } = player('st');
  render(<Editing potential={190} />);
  await type('current_ability', '150');
  await type('attribute.finishing', '20');
  expect(held('current_ability')).toBe('150');
  const suggested = ability + Math.round((20 - attributes.finishing) * FINISHING);
  expect(screen.getByRole('button', { name: `Suggested CA ${suggested}` })).toBeTruthy();
});

test('the potential is left as it is, and an ability above it is said', async () => {
  const { ability } = player('st');
  const first = render(<Editing potential={ability} />);
  expect(screen.queryByText('CA is above PA')).toBeNull();
  await type('attribute.finishing', '20');
  expect(Number(held('current_ability'))).toBeGreaterThan(ability);
  expect(held('potential_ability')).toBe(String(ability));
  expect(screen.getByText('CA is above PA')).toBeTruthy();
  // Until the potential is typed up to it.
  await type('potential_ability', held('current_ability'));
  expect(screen.queryByText('CA is above PA')).toBeNull();
  first.unmount();
  // A potential set as a range has no one number to be above.
  render(<Editing potential={-9} />);
  await type('attribute.finishing', '20');
  expect(Number(held('current_ability'))).toBeGreaterThan(ability);
  expect(held('potential_ability')).toBe('-9');
  expect(screen.queryByText('CA is above PA')).toBeNull();
});

test('attributes that fit more than the game holds are said, with the ability they fit', async () => {
  const { ability, positions } = player('st');
  const best = named(ABILITY_ATTRIBUTES, ABILITY_ATTRIBUTES.map(() => 20));
  const first = render(<Editing potential={200} />);
  await type('attribute.finishing', '20');
  expect(screen.queryByText(/the most is 200/)).toBeNull();
  first.unmount();
  render(<Editing potential={200} best />);
  expect(screen.getByText(/the most is 200/)).toBeTruthy();
  await type('attribute.finishing', '19');
  const fitted = fittedAbility(ability, { attributes: best, positions }, { attributes: { ...best, finishing: 19 }, positions })!;
  expect(fitted).toBeGreaterThan(200);
  expect(screen.getByText(`Attributes fit CA ${fitted}, the most is 200`)).toBeTruthy();
  expect(held('current_ability')).toBe('200');
});

const change = (id: number, field: string, old: number, written: number, more: Partial<LoggedChange> = {}): LoggedChange =>
  ({ id, at: id, name: 'Fixture', entity: 'player', uid: STRIKER, field, old, new: written, undoneAt: null, batch: null, ...more });

test('the values before are those of the oldest change that stands', () => {
  const before = (log: LoggedChange[]) => valuesBefore(log).get(`player:${STRIKER}`)?.get('attribute.finishing');
  expect(before([change(2, 'attribute.finishing', 65, 90), change(1, 'attribute.finishing', 78, 65)])).toBe(78);
  expect(before([change(2, 'attribute.finishing', 65, 90), change(1, 'attribute.finishing', 78, 65, { undoneAt: 5 })])).toBe(65);
  expect(before([change(1, 'attribute.finishing', 78, 65, { earlierGame: true })])).toBeUndefined();
  expect(before([change(1, 'attribute.finishing', 78, 65, { uid: STRIKER + 1 })])).toBeUndefined();
});

test('an ability left behind or typed in by an earlier Apply does not raise the next suggestion', async () => {
  const { ability, attributes } = player('st');
  // What putting his finishing at 16 is worth to the striker the game made: a point.
  const suggested = ability + Math.round((16 - attributes.finishing) * FINISHING);
  // His finishing was taken down to 13 and the ability left where it was: putting it at 16 gives it back, no more.
  const lowered = [change(1, 'attribute.finishing', attributes.finishing * 5, 65)];
  const first = render(<Editing potential={190} log={lowered} />);
  await type('attribute.finishing', '16');
  expect(held('current_ability')).toBe(String(suggested));
  first.unmount();
  // The same with an ability typed in on top, which is held: the suggestion is still the game's own.
  render(<Editing potential={190} log={[change(2, 'current_ability', ability, ability + 2), ...lowered]} />);
  await type('attribute.finishing', '16');
  expect(held('current_ability')).toBe(String(ability + 2));
  expect(screen.getByRole('button', { name: `Suggested CA ${suggested}` })).toBeTruthy();
});

test('an offset that is kept holds while the ability is not seen below it', () => {
  const { ability, attributes, positions } = player('st');
  const own = ownAbility(ability, { attributes, positions })!;
  // An ability left above what he needs, by a little or by far, and one within the rounding of an Apply.
  for (const left of [5, 60, -0.5]) {
    expect(ownAbility(ability + left, { attributes, positions }, own)).toBe(own);
  }
  // Seen further below: the offset kept was too high, as one taken from an ability that was typed in is.
  expect(ownAbility(ability - 3, { attributes, positions }, own)).toBeCloseTo(own - 3, 5);
  // An ability typed in far below what he needs says nothing.
  expect(ownAbility(ability - 60, { attributes, positions }, own)).toBe(own);
  expect(ownAbility(ability - 60, { attributes, positions })).toBe(0);
});

test('the game\'s own offset is remembered by career once his abilities are applied', async () => {
  const { ability, attributes, positions } = player('st');
  const own = ownAbility(ability, { attributes, positions })!;
  const suggested = ability + Math.round((16 - attributes.finishing) * FINISHING);
  // His finishing is taken down to 13, the ability left where it is.
  const first = render(<Editing potential={190} />);
  expect(keptOwnAbility(CAREER, STRIKER)).toBeNull();
  await type('attribute.finishing', '13');
  expect(keptOwnAbility(CAREER, STRIKER)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(keptOwnAbility(CAREER, STRIKER)).toBeCloseTo(own, 2);
  first.unmount();
  // FM Lens is opened again: the change log is empty, and the ability he has is above what he needs.
  const lowered = [change(1, 'attribute.finishing', attributes.finishing * 5, 65)];
  const again = render(<Editing potential={190} log={lowered} reopened />);
  await type('attribute.finishing', '16');
  expect(held('current_ability')).toBe(String(suggested));
  again.unmount();
  // Another career knows nothing of him, and where none is told nothing is kept.
  const other = render(<Editing potential={190} log={lowered} reopened career="Steam:2000000002" />);
  await type('attribute.finishing', '16');
  expect(Number(held('current_ability'))).toBeGreaterThan(suggested);
  other.unmount();
  const stored = localStorage.getItem('fm-lens.ownAbility.careers');
  render(<Editing potential={190} career={null} />);
  await type('attribute.finishing', '13');
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(localStorage.getItem('fm-lens.ownAbility.careers')).toBe(stored);
  expect(keptOwnAbility(null, STRIKER)).toBeNull();
});
