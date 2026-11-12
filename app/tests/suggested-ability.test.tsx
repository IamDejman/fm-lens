import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { ABILITY_ATTRIBUTES, ABILITY_POSITIONS, abilityFor, suggestedAbility } from '../src/abilityEstimate';
import { inputState, type Typed } from '../src/editDraft';
import { SuggestedAbility } from '../src/SuggestedAbility';
import { SessionContext, type EditSession } from '../src/useProfileEditing';
import type { EditField } from '../src/types';

// One player of each role as a save held him, no names: the ability the game gave him, his attributes as stored
// (0-100, in the order of ABILITY_ATTRIBUTES) and his position ratings (in the order of ABILITY_POSITIONS).
const PLAYERS = [
  { role: 'gk', ability: 129, raw: [20,15,10,15,57,38,5,5,10,5,63,5,15,40,45,62,60,75,59,56,85,35,40,10,70,65,36,55,59,67,52,70,50,47,59,50,65,54,70,70,67,67,81,60,60,100], ratings: [20,1,1,1,1,1,1,1,1,1,1,1,1,1] },
  { role: 'dc', ability: 129, raw: [19,50,50,25,62,30,71,24,64,71,60,36,70,62,75,65,70,64,70,54,80,47,55,34,66,59,41,64,66,59,70,79,85,65,71,76,5,5,20,5,10,15,5,5,40,100], ratings: [1,20,1,1,1,1,1,1,1,1,1,1,1,1] },
  { role: 'fb', ability: 127, raw: [31,59,54,46,61,31,64,44,38,64,61,55,63,61,55,67,61,65,71,61,70,33,22,46,64,64,63,64,64,62,61,70,78,72,66,67,10,10,15,5,5,10,10,5,40,100], ratings: [1,20,1,18,1,17,1,1,1,15,1,1,1,1] },
  { role: 'wb', ability: 128, raw: [29,69,61,47,61,29,37,42,46,56,53,37,61,56,45,64,70,48,60,59,51,31,42,61,69,62,61,70,76,66,50,38,58,72,66,55,20,10,5,5,15,10,20,5,55,100], ratings: [1,1,16,20,1,17,1,1,1,17,1,12,1,1] },
  { role: 'dm', ability: 128, raw: [36,50,53,50,60,35,40,50,25,65,60,45,70,60,60,76,75,61,65,61,70,60,65,60,70,81,62,80,65,65,60,34,75,65,85,60,10,5,15,5,10,5,10,10,40,100], ratings: [1,9,8,13,9,11,20,17,13,12,1,8,1,1] },
  { role: 'mc', ability: 129, raw: [70,50,64,34,69,65,45,69,25,61,80,34,60,74,60,68,70,69,68,65,50,75,75,65,60,69,74,73,43,51,46,53,75,62,64,65,10,10,5,10,15,15,5,15,100,50], ratings: [1,1,1,1,1,1,15,20,1,1,1,1,18,1] },
  { role: 'wm', ability: 128, raw: [63,80,68,46,66,65,44,73,47,61,69,74,61,70,70,61,65,70,61,61,70,65,60,64,52,65,59,59,64,62,63,49,61,63,63,48,5,5,15,10,15,10,10,5,100,35], ratings: [1,1,19,1,20,2,12,15,15,1,11,1,1,1] },
  { role: 'w', ability: 130, raw: [20,44,78,43,75,25,29,38,10,33,58,33,13,82,20,55,24,59,49,58,75,82,18,51,35,41,63,64,71,82,79,36,64,76,61,57,15,15,5,10,15,5,5,15,75,100], ratings: [1,1,1,1,1,1,1,1,1,1,17,20,10,15] },
  { role: 'amc', ability: 130, raw: [76,74,72,66,74,69,56,60,41,46,78,66,35,76,55,70,61,64,67,66,75,61,48,76,58,69,75,75,61,69,65,44,60,55,58,52,5,5,15,15,5,15,5,15,40,100], ratings: [1,1,1,1,1,1,1,14,14,14,15,15,20,5] },
  { role: 'st', ability: 128, raw: [34,47,69,78,59,40,60,44,39,30,64,40,28,73,55,74,60,69,69,69,75,75,40,76,39,60,74,61,65,60,54,57,51,67,46,50,15,20,15,15,15,20,5,5,100,60], ratings: [1,1,1,1,1,1,1,1,1,1,10,15,15,20] },
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

test('the estimate lands on the ability the game holds, for every role', () => {
  for (const { role } of PLAYERS) {
    const { ability, attributes, positions } = player(role);
    expect(Math.abs(abilityFor(attributes, positions)! - ability), role).toBeLessThan(1.5);
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

test('the dearest of the positions he plays sets the ability', () => {
  const { attributes } = player('st');
  const striker = abilityFor(attributes, { st: 20 })!;
  // A position below 15 is not played; with a second one that is, the dearer of the two counts.
  expect(abilityFor(attributes, { st: 20, dc: 14 })).toBe(striker);
  expect(abilityFor(attributes, { st: 1, dc: 20 })).toBeLessThan(striker);
  expect(abilityFor(attributes, { st: 20, dc: 20 })).toBeCloseTo(striker - 0.3, 5);
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

// The striker being edited: the inputs judge what is typed as the profile's do.
function Editing({ potential }: { potential: number }) {
  const { ability, raw, positions } = player('st');
  const [typed, setTyped] = useState<Typed>({});
  const details = useMemo(() => ({
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
      busy: false,
      has: (key) => fields.has(key),
      input: (key) => {
        const found = fields.get(key);
        return found ? inputState(found[0], found[1], typed[key], undefined) : null;
      },
      type: (key, text) => setTyped((old) => ({ ...old, [key]: text })),
    };
  }, [ability, potential, raw, positions, typed]);
  return <SessionContext.Provider value={session}>
    <SuggestedAbility details={details} />
    {['current_ability', 'potential_ability', 'attribute.finishing', 'position.dc'].map((key) =>
      <input key={key} aria-label={key} value={session.input(key)?.text ?? ''} onChange={(e) => session.type(key, e.target.value)} />)}
  </SessionContext.Provider>;
}

const type = async (label: string, value: string) => {
  const input = screen.getByRole('textbox', { name: label });
  await userEvent.clear(input);
  await userEvent.type(input, value);
};
const held = (label: string) => (screen.getByRole('textbox', { name: label }) as HTMLInputElement).value;

test('the button follows what is typed, and puts the ability in the input', async () => {
  const { ability, attributes } = player('st');
  render(<Editing potential={190} />);
  expect(screen.queryByRole('button')).toBeNull();
  await type('attribute.finishing', '20');
  const suggested = ability + Math.round((20 - attributes.finishing) * 1.5);
  await userEvent.click(screen.getByRole('button', { name: `Suggested CA ${suggested}` }));
  expect(held('current_ability')).toBe(String(suggested));
  expect(held('potential_ability')).toBe('190');
  expect(screen.queryByRole('button')).toBeNull();
  // Typed back, the ability he had is the suggestion again.
  await type('attribute.finishing', String(Math.floor(attributes.finishing + 0.4)));
  expect(screen.getByRole('button', { name: `Suggested CA ${ability}` })).toBeTruthy();
});

test('a potential below the suggestion is raised to it, one set as a range is left', async () => {
  const { ability } = player('st');
  const first = render(<Editing potential={ability} />);
  await type('attribute.finishing', '20');
  await userEvent.click(screen.getByRole('button'));
  expect(held('potential_ability')).toBe(held('current_ability'));
  expect(Number(held('current_ability'))).toBeGreaterThan(ability);
  first.unmount();
  render(<Editing potential={-9} />);
  await type('attribute.finishing', '20');
  await userEvent.click(screen.getByRole('button'));
  expect(held('potential_ability')).toBe('-9');
});
