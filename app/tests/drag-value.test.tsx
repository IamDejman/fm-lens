import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { draggedText, dragPace } from '../src/editDraft';
import { EditInput } from '../src/EditControls';
import { EditorContext, NO_GAME_ACTIONS, SessionContext, useProfileEditing } from '../src/useProfileEditing';
import { mockInvoke } from '../src/dev/mock';
import { call } from '../src/api';
import type { EditField } from '../src/types';
vi.mock('../src/api', () => ({ inTauri: false, call: vi.fn(), watchCommands: vi.fn() }));
beforeEach(() => { vi.mocked(call).mockImplementation(mockInvoke); });

const field = (key: string, kind: EditField['kind'], min: number, max: number, more: Partial<EditField> = {}): EditField =>
  ({ key, entity: 'player', kind, scale: 'plain', min, max, blank: null, choices: null, mass: true, ...more } as EditField);

test('a narrow range is dragged one value at a time and stops at its ends', () => {
  const ability = field('current_ability', 'u16', 1, 200);
  expect(draggedText(ability, 150, 3)).toBe('153');
  expect(draggedText(ability, 150, -3)).toBe('147');
  expect(draggedText(ability, 150, 500)).toBe('200');
  expect(draggedText(ability, 150, -500)).toBe('1');
  expect(draggedText(ability, 150, 0)).toBe('150');
});

test('a wide range is dragged by its second digit, to whole steps', () => {
  const balance = field('finance.balance', 'i32', -2_000_000_000, 2_000_000_000);
  expect(draggedText(balance, 17_551_479, 1)).toBe('18000000');
  expect(draggedText(balance, 17_551_479, 3)).toBe('20000000');
  expect(draggedText(balance, 17_551_479, -1)).toBe('17000000');
  expect(draggedText(balance, 0, -2)).toBe('-20');
  const reputation = field('reputation', 'u16', 0, 10_000);
  expect(draggedText(reputation, 8_200, 2)).toBe('8400');
  expect(draggedText(reputation, 9_950, 5)).toBe('10000');
});

test('a wage is dragged to the wages FM shows as they are', () => {
  const wage = field('contract.wage', 'i32', 0, 10_000_000);
  expect(draggedText(wage, 300_000, 1)).toBe('325000');
  expect(draggedText(wage, 185_198, -1)).toBe('185000');
  expect(draggedText(wage, 185_198, 2)).toBe('195000');
});

test('a drag from no squad number begins at the first or the last one', () => {
  const squadNumber = field('contract.squad_number', 'u8', 1, 99, { blank: 255 });
  expect(draggedText(squadNumber, 255, 1)).toBe('1');
  expect(draggedText(squadNumber, 255, -2)).toBe('98');
  expect(draggedText(squadNumber, 255, 0)).toBe('');
});

test('an attribute takes more of a drag for each step than an ability does', () => {
  expect(dragPace(field('attribute.finishing', 'u8', 0, 100, { scale: 'attribute' }))).toBe(8);
  expect(dragPace(field('current_ability', 'u16', 1, 200))).toBe(3);
  expect(dragPace(field('finance.balance', 'i32', -2_000_000_000, 2_000_000_000))).toBe(4);
});

function DragHarness() {
  const edit = useProfileEditing('player', 1009102);
  return <SessionContext.Provider value={edit.session}>
    <button onClick={() => edit.begin()}>Edit fixture</button>
    <EditInput field="attribute.finishing" />
    <EditInput field="contract.expires" />
    <p>{edit.changes.length} pending</p>
  </SessionContext.Provider>;
}

async function editing() {
  render(<EditorContext.Provider value={{ editable: true, readOnlyNote: '', onEdited() {}, gameActions: NO_GAME_ACTIONS, injuryKinds: async () => [], gameDate: null, openPlayer() {}, openStaff() {}, findSimilar() {} }}><DragHarness /></EditorContext.Provider>);
  await userEvent.click(screen.getByRole('button', { name: 'Edit fixture' }));
  return await screen.findByRole('spinbutton', { name: 'Finishing' }) as HTMLInputElement;
}
const mouse = (clientX: number) => ({ pointerId: 1, isPrimary: true, button: 0, pointerType: 'mouse', clientX });

test('pressing on a number and moving sideways changes it; letting go leaves it to be applied', async () => {
  const input = await editing();
  const start = Number(input.value);
  fireEvent.pointerDown(input, mouse(100));
  fireEvent.pointerMove(input, mouse(102));
  expect(input.value).toBe(String(start));
  expect(input.classList.contains('dragging')).toBe(false);
  // 4 pixels make it a drag; an attribute then moves a step for every 8.
  fireEvent.pointerMove(input, mouse(104));
  fireEvent.pointerMove(input, mouse(104 - 17));
  expect(input.classList.contains('dragging')).toBe(true);
  const down = Math.max(1, start - 2);
  expect(input.value).toBe(String(down));
  fireEvent.pointerMove(input, mouse(104 + 9));
  expect(input.value).toBe(String(Math.min(20, start + 1)));
  fireEvent.pointerMove(input, mouse(104 - 17));
  fireEvent.pointerUp(input, mouse(104 - 17));
  expect(input.classList.contains('dragging')).toBe(false);
  expect(input.value).toBe(String(down));
  expect(screen.getByText(down === start ? '0 pending' : '1 pending')).toBeTruthy();
  // The button is up: moving on changes nothing more.
  fireEvent.pointerMove(input, mouse(400));
  expect(input.value).toBe(String(down));
});

test('a press that does not move, a finger and a date leave the value alone', async () => {
  const input = await editing();
  const start = input.value;
  fireEvent.pointerDown(input, mouse(100));
  fireEvent.pointerUp(input, mouse(100));
  fireEvent.pointerDown(input, { ...mouse(100), pointerType: 'touch' });
  fireEvent.pointerMove(input, { ...mouse(180), pointerType: 'touch' });
  fireEvent.pointerUp(input, { ...mouse(180), pointerType: 'touch' });
  expect(input.value).toBe(start);
  const date = document.querySelector<HTMLInputElement>('[data-field="contract.expires"]')!;
  const before = date.value;
  fireEvent.pointerDown(date, mouse(100));
  fireEvent.pointerMove(date, mouse(180));
  fireEvent.pointerUp(date, mouse(180));
  expect(date.value).toBe(before);
  expect(date.classList.contains('draggable')).toBe(false);
});
