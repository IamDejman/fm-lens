import { expect, test } from 'vitest';
import { cardCaption, cardFileStem, topAttributes } from '../src/shareCard';
import type { Attribute } from '../src/types';

const rated = (values: Record<string, number>): Record<string, Attribute> =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { raw: value * 5, value }]));

test('the best attributes come first, ties in the order FM lists them', () => {
  const attributes = rated({ finishing: 18, pace: 18, dribbling: 18, vision: 12, corners: 5, consistency: 20, left_foot: 20 });
  const top = topAttributes({ attributes, positionRatings: { st: 20 } }, 4);
  expect(top.map((attribute) => attribute.key)).toEqual(['dribbling', 'finishing', 'pace', 'vision']);
  expect(top[0]).toEqual({ key: 'dribbling', label: 'Dribbling', value: 18 });
});

test('a keeper is shown by his goalkeeping, and an attribute in two groups counts once', () => {
  const attributes = rated({ reflexes: 17, handling: 16, first_touch: 15, corners: 19, passing: 15 });
  const top = topAttributes({ attributes, positionRatings: { gk: 20 } });
  expect(top.map((attribute) => attribute.key)).toEqual(['reflexes', 'handling', 'first_touch', 'passing']);
});

test('the caption calls a young player a wonderkid and links back with the card source', () => {
  expect(cardCaption({ age: 19 })).toBe('Found this wonderkid in my FM27 save #FM27 getfmlens.com/?s=card');
  expect(cardCaption({ age: 27 })).toBe('Found this player in my FM27 save #FM27 getfmlens.com/?s=card');
  expect(cardCaption({ age: null })).toBe('Found this player in my FM27 save #FM27 getfmlens.com/?s=card');
});

test('the file is named after the player, the size and the in-game date, in plain letters', () => {
  expect(cardFileStem('Arda Güler', 'post', { year: 2026, month: 7, day: 8 })).toBe('arda-guler-post-2026-07-08');
  expect(cardFileStem("N'Golo Kanté", 'story', null)).toBe('n-golo-kante-story');
  expect(cardFileStem('三笘 薫', 'post', null)).toBe('player-post');
  expect(cardFileStem('a'.repeat(80), 'post', null)).toBe(`${'a'.repeat(48)}-post`);
});
