import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailGate, emailGiven } from '../src/EmailGate';

const opener = vi.hoisted(() => ({ openUrl: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/plugin-opener', () => opener);
vi.mock('../src/api', () => ({ inTauri: true }));

const answers = (answer: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ json: async () => answer }) as Response);

async function give(address: string) {
  const onGiven = vi.fn();
  render(<EmailGate onGiven={onGiven} />);
  await userEvent.type(screen.getByRole('textbox'), address);
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  return onGiven;
}

beforeEach(() => {
  localStorage.clear();
  opener.openUrl.mockClear();
});

test('an address Kit takes opens the app and is asked for once', async () => {
  const fetch = answers({ status: 'success' });
  const onGiven = await give('fan@example.com');
  await waitFor(() => expect(onGiven).toHaveBeenCalledOnce());
  expect(emailGiven()).toBe(true);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe('https://app.kit.com/forms/10172074/subscriptions');
  expect((request?.body as FormData).get('email_address')).toBe('fan@example.com');
});

test('an address Kit refuses keeps the app closed', async () => {
  answers({ status: 'failed', errors: { messages: ['Email address is invalid'] } });
  const onGiven = await give('fan@example');
  expect(await screen.findByText('That did not work. Check the address and try again.')).toBeTruthy();
  expect(onGiven).not.toHaveBeenCalled();
  expect(emailGiven()).toBe(false);
  expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', false);
});

test('Kit out of reach keeps the app closed', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  const onGiven = await give('fan@example.com');
  expect(await screen.findByText('That did not work. Check your connection and try again.')).toBeTruthy();
  expect(onGiven).not.toHaveBeenCalled();
  expect(emailGiven()).toBe(false);
});

test('an address Kit holds opens its check in the browser and the app', async () => {
  answers({ status: 'quarantined', url: 'https://app.kit.com/forms/10172074/check' });
  const onGiven = await give('fan@example.com');
  await waitFor(() => expect(onGiven).toHaveBeenCalledOnce());
  expect(opener.openUrl).toHaveBeenCalledWith('https://app.kit.com/forms/10172074/check');
  expect(emailGiven()).toBe(true);
});

test('a page outside Kit is never opened', async () => {
  answers({ status: 'quarantined', url: 'https://example.com/check' });
  const onGiven = await give('fan@example.com');
  await waitFor(() => expect(onGiven).toHaveBeenCalledOnce());
  expect(opener.openUrl).not.toHaveBeenCalled();
});
