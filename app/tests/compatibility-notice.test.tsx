import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompatibilityNotice } from '../src/CompatibilityNotice';
import { mockInvoke } from '../src/dev/mock';
import type { ConnectionInfo } from '../src/types';
import type { UpdateState } from '../src/update';

const RELAUNCH = { name: 'Relaunch to update' };
const CHECK = { name: 'Check for updates' };

/** A game FM Lens has no profile for, which it opened read-only. */
async function unsupported(): Promise<ConnectionInfo> {
  const connection = await mockInvoke<ConnectionInfo>('connect');
  return { ...connection, profile: null, knownBuild: false, editable: false };
}

function notice(connection: ConnectionInfo, update: UpdateState | null) {
  const onRelaunch = vi.fn();
  const onCheck = vi.fn();
  render(<CompatibilityNotice connection={connection} update={update} onRelaunch={onRelaunch} onCheck={onCheck} />);
  return { onRelaunch, onCheck };
}

test('a game too new for this version offers the update that is ready', async () => {
  const { onRelaunch } = notice(await unsupported(), { phase: 'ready', version: '0.7.10' });
  expect(screen.queryByRole('button', CHECK)).toBeNull();
  await userEvent.click(screen.getByRole('button', RELAUNCH));
  expect(onRelaunch).toHaveBeenCalledWith('0.7.10');
});

test('with no update yet, it offers to look for one', async () => {
  const { onCheck } = notice(await unsupported(), null);
  expect(screen.queryByRole('button', RELAUNCH)).toBeNull();
  await userEvent.click(screen.getByRole('button', CHECK));
  expect(onCheck).toHaveBeenCalled();
});

test('an update this copy cannot install is left to its own notice', async () => {
  notice(await unsupported(), { phase: 'available', version: '0.7.10' });
  expect(screen.queryByRole('button', RELAUNCH)).toBeNull();
  expect(screen.queryByRole('button', CHECK)).toBeNull();
});

test('a supported game shows no notice, update or not', async () => {
  const connection = await mockInvoke<ConnectionInfo>('connect');
  const { container } = render(
    <CompatibilityNotice
      connection={{ ...connection, knownBuild: true }}
      update={{ phase: 'ready', version: '0.7.10' }}
      onRelaunch={() => {}}
      onCheck={() => {}}
    />,
  );
  expect(container.firstChild).toBeNull();
});
