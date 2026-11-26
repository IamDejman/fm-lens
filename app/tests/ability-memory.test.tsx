import { beforeEach, expect, test, vi } from 'vitest';
import { ABILITY_ATTRIBUTES, abilityFor } from '../src/abilityEstimate';
import { claimOwnAbilities, keepOwnAbilities, keepOwnAbility, keptOwnAbility } from '../src/abilityMemory';
import type { LoggedChange } from '../src/types';

const CAREER = 'Steam:2000000001';
const OTHER = 'Steam:2000000002';
const BY_NAME = 'fm-lens.ownAbility';

// What the game holds now, by player, and what was written to it.
const game = vi.hoisted(() => ({ log: [] as unknown[], values: {} as Record<number, Record<string, number>> }));
vi.mock('../src/dev/mock', () => ({
  mockInvoke: async (command: string, args?: { uid?: number }) => {
    if (command === 'change_log') {
      return game.log;
    }
    if (command === 'read_values' && args?.uid !== undefined && game.values[args.uid]) {
      return game.values[args.uid];
    }
    throw new Error(`${command} of ${args?.uid}`);
  },
}));

beforeEach(() => {
  localStorage.clear();
  game.log = [];
  game.values = {};
});

test('a career keeps its offsets whatever its save is named, and no other career has them', () => {
  keepOwnAbility(CAREER, 7, 2.5);
  expect(keptOwnAbility(CAREER, 7)).toBe(2.5);
  expect(keptOwnAbility(OTHER, 7)).toBeNull();
  expect(keptOwnAbility(null, 7)).toBeNull();
});

test('offsets kept by save name go to the first career seen under that name, once', () => {
  localStorage.setItem(BY_NAME, JSON.stringify({ 'My career': { 7: 2.5 }, Untouched: { 8: 1 } }));
  claimOwnAbilities(null, 'My career');
  expect(JSON.parse(localStorage.getItem(BY_NAME)!)['My career']).toEqual({ 7: 2.5 });
  claimOwnAbilities(CAREER, 'My career');
  expect(keptOwnAbility(CAREER, 7)).toBe(2.5);
  expect(JSON.parse(localStorage.getItem(BY_NAME)!)).toEqual({ Untouched: { 8: 1 } });
  // A new career saved under the old name finds nothing there.
  claimOwnAbilities(OTHER, 'My career');
  expect(keptOwnAbility(OTHER, 7)).toBeNull();
  // A career that was seen takes nothing after: not under the name it is saved as later.
  claimOwnAbilities(OTHER, 'Untouched');
  expect(keptOwnAbility(OTHER, 8)).toBeNull();
  expect(JSON.parse(localStorage.getItem(BY_NAME)!)).toEqual({ Untouched: { 8: 1 } });
});

const change = (id: number, uid: number, field: string, old: number, written: number, more: Partial<LoggedChange> = {}): LoggedChange =>
  ({ id, at: id, name: 'Fixture', entity: 'player', uid, field, old, new: written, undoneAt: null, batch: 3, ...more });

test('a mass edit keeps the offset of each player it wrote, from what he had before', async () => {
  // Three strikers the game made alike, 4 above what their attributes fit; finishing was 13 and is now 20.
  const attributes = Object.fromEntries(ABILITY_ATTRIBUTES.map((key) => [key, 13]));
  const ability = Math.round(abilityFor(attributes, { st: 20 })!) + 4;
  const own = ability - abilityFor(attributes, { st: 20 })!;
  const stored = {
    current_ability: ability,
    'position.st': 20,
    ...Object.fromEntries(ABILITY_ATTRIBUTES.map((key) => [`attribute.${key}`, key === 'finishing' ? 100 : 65])),
  };
  game.values = { 7: stored, 8: stored, 10: stored };
  game.log = [
    change(1, 7, 'attribute.finishing', 65, 100),
    // What says nothing of his ability, another batch, a change undone and a player who is gone are passed over.
    change(2, 8, 'wage', 100, 200),
    change(3, 10, 'attribute.finishing', 65, 100, { batch: 4 }),
    change(4, 10, 'attribute.passing', 65, 70, { undoneAt: 9 }),
    change(5, 9, 'attribute.finishing', 65, 100),
  ];
  await keepOwnAbilities(CAREER, 3);
  expect(keptOwnAbility(CAREER, 7)).toBeCloseTo(own, 2);
  expect(keptOwnAbility(CAREER, 8)).toBeNull();
  expect(keptOwnAbility(CAREER, 9)).toBeNull();
  expect(keptOwnAbility(CAREER, 10)).toBeNull();
  // No career is told: nothing is read or kept.
  await keepOwnAbilities(null, 4);
  expect(keptOwnAbility(CAREER, 10)).toBeNull();
});
