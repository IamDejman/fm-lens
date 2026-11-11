import { afterEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportDialog } from '../src/ReportDialog';
import { RELAY } from '../src/report';

// As in the app, where the wish is sent; in the browser preview nothing is.
vi.mock('../src/api', async (original) => ({ ...(await original<typeof import('../src/api')>()), inTauri: true }));

const FACTS = { version: '0.7.5', connection: null, detected: null, log: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

test('a wish is sent to the relay with the version only, and the window says so', async () => {
  const fetch = vi.fn(async () => new Response('{"sent":true}', { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  render(<ReportDialog kind="wish" facts={FACTS} onClose={() => {}} />);
  expect(screen.getByRole('dialog', { name: 'Wishlist' })).toBeTruthy();
  await userEvent.type(screen.getByLabelText('What should FM Lens do next?'), 'Edit stadiums');
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('Sent. Thanks.')).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(`${RELAY}/wish`);
  expect(JSON.parse(String(init.body))).toEqual({ what: 'Edit stadiums', version: '0.7.5' });
});

test('too many wishes from here says to wait', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"tooMany"}', { status: 429 })));
  render(<ReportDialog kind="wish" facts={FACTS} onClose={() => {}} />);
  await userEvent.type(screen.getByLabelText('What should FM Lens do next?'), 'Edit stadiums');
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Too many from here. Try again in an hour.');
});
