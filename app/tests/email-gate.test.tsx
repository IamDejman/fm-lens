import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailGate, emailGiven } from '../src/EmailGate';
import { RELAY } from '../src/report';

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
});

test('an address the relay subscribes opens the app and is asked for once', async () => {
  const fetch = answers({ subscribed: true });
  const onGiven = await give('fan@example.com');
  await waitFor(() => expect(onGiven).toHaveBeenCalledOnce());
  expect(emailGiven()).toBe(true);
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe(`${RELAY}/subscribe`);
  expect(JSON.parse(String(request?.body))).toEqual({ email: 'fan@example.com' });
});

test('an address turned down keeps the app closed', async () => {
  answers({ error: 'invalid' });
  const onGiven = await give('fan@example');
  expect(await screen.findByText('That did not work. Check the address and try again.')).toBeTruthy();
  expect(onGiven).not.toHaveBeenCalled();
  expect(emailGiven()).toBe(false);
  expect(screen.getByRole('button', { name: 'Continue' })).toHaveProperty('disabled', false);
});

test.each([
  ['the relay out of reach', () => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))],
  ['Kit failing', () => answers({ error: 'notSubscribed' })],
  ['too many tries', () => answers({ error: 'tooMany' })],
])('%s keeps the app closed', async (_, answer) => {
  answer();
  const onGiven = await give('fan@example.com');
  expect(await screen.findByText('That did not work. Check your connection and try again.')).toBeTruthy();
  expect(onGiven).not.toHaveBeenCalled();
  expect(emailGiven()).toBe(false);
});
