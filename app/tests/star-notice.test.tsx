import { beforeEach, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { call } from '../src/api';
import { StarNotice, useStarAsk } from '../src/StarNotice';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }));
// Every command succeeds, so each one is heard.
vi.mock('../src/dev/mock', () => ({ mockInvoke: async () => null }));

function Host() {
  const { asking, answer } = useStarAsk();
  return asking ? <StarNotice onAnswer={answer} /> : null;
}

const STAR = { name: 'Star on GitHub' };

async function edit(times: number) {
  for (let i = 0; i < times; i++) {
    await act(() => call('set_captain'));
  }
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(openUrl).mockClear();
});

test('asks for a star after the 20th edit, and not before', async () => {
  render(<Host />);
  await edit(19);
  expect(screen.queryByRole('button', STAR)).toBeNull();
  await edit(1);
  expect(screen.getByRole('button', STAR)).toBeTruthy();
});

test('someone who ran an earlier version is asked after their first edit in this one', async () => {
  localStorage.setItem('fm-lens.version', '0.7.4');
  render(<Host />);
  expect(screen.queryByRole('button', STAR)).toBeNull();
  await edit(1);
  expect(screen.getByRole('button', STAR)).toBeTruthy();
});

test('a new install is not given a head start on a later launch', async () => {
  const { unmount } = render(<Host />);
  unmount();
  localStorage.setItem('fm-lens.version', '0.7.5');
  render(<Host />);
  await edit(1);
  expect(screen.queryByRole('button', STAR)).toBeNull();
});

test('Star on GitHub opens the repository and ends the ask for good', async () => {
  localStorage.setItem('fmlens.edits', '20');
  const { unmount } = render(<Host />);
  await userEvent.click(screen.getByRole('button', STAR));
  expect(openUrl).toHaveBeenCalledWith('https://github.com/IamDejman/fm-lens');
  expect(screen.queryByRole('button', STAR)).toBeNull();
  unmount();
  render(<Host />);
  await edit(1);
  expect(screen.queryByRole('button', STAR)).toBeNull();
});

test('Not now ends the ask for good without opening GitHub', async () => {
  localStorage.setItem('fmlens.edits', '25');
  const { unmount } = render(<Host />);
  await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(openUrl).not.toHaveBeenCalled();
  unmount();
  render(<Host />);
  expect(screen.queryByRole('button', STAR)).toBeNull();
});

test('reads are not counted as edits', async () => {
  render(<Host />);
  for (let i = 0; i < 25; i++) {
    await act(() => call('career'));
  }
  expect(screen.queryByRole('button', STAR)).toBeNull();
});
