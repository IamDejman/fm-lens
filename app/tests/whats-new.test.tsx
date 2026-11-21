import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { updateText } from '../src/labels';
import { trackOpened } from '../src/usage';
import { useWhatsNew, WhatsNewNotice } from '../src/WhatsNew';

// A release build in the app's own window, where usage is counted.
vi.mock('../src/api', async (original) => ({ ...(await original<typeof import('../src/api')>()), inTauri: true }));
vi.mock('@tauri-apps/api/app', () => ({
  getVersion: async () => newest((await import('../src/labels')).updateText.changes),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string) => (command === 'debug_build' ? false : 'macOS 26'),
}));
// The window is not recorded here.
vi.mock('../src/replay', () => ({ replaySession: () => ({}), startReplay() {}, stopReplay() {} }));

function newest(changes: Record<string, readonly string[]>): string {
  return Object.keys(changes)[0] ?? '';
}

/** The newest version with changes listed. */
const VERSION = newest(updateText.changes);
const HEADING = updateText.whatsNew(VERSION);

function Host() {
  const { whatsNew, dismiss } = useWhatsNew(VERSION);
  return whatsNew ? <WhatsNewNotice version={whatsNew} onDismiss={dismiss} /> : null;
}

const sent = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));

const events = (fetch: ReturnType<typeof sent>) =>
  fetch.mock.calls.map(([, request]) => JSON.parse(String(request?.body)) as { event: string; properties: Record<string, unknown> });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test('an update shows what is new once the update itself has been counted', async () => {
  localStorage.setItem('fm-lens.version', '1.1.4');
  const fetch = sent();
  trackOpened();
  await waitFor(() => expect(events(fetch).map((sent) => sent.event)).toContain('update_installed'));
  expect(events(fetch).find((sent) => sent.event === 'update_installed')?.properties).toMatchObject({ from: '1.1.4', to: VERSION });
  render(<Host />);
  expect(screen.getByText(HEADING)).toBeTruthy();
});

test('the same version says nothing at its next start, and counts no update', async () => {
  localStorage.setItem('fm-lens.version', '1.1.4');
  const fetch = sent();
  trackOpened();
  await waitFor(() => expect(events(fetch).map((sent) => sent.event)).toContain('update_installed'));
  render(<Host />).unmount();
  sessionStorage.clear();
  fetch.mockClear();
  trackOpened();
  await waitFor(() => expect(events(fetch).map((sent) => sent.event)).toContain('app_opened'));
  render(<Host />);
  expect(screen.queryByText(HEADING)).toBeNull();
  expect(events(fetch).map((sent) => sent.event)).not.toContain('update_installed');
});

test('a first start says nothing', () => {
  sent();
  render(<Host />);
  expect(screen.queryByText(HEADING)).toBeNull();
});
