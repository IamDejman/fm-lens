import { useCallback, useEffect, useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../src/dev/mock';
import { PreferencesGroup } from '../src/RelationGroups';
import type { LoggedChange, PlayerDetails, PlayerPage, Preference, StaffPage } from '../src/types';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';

const likes = async (uid: number) => (await mockInvoke<PlayerDetails>('player_details', { uid })).preferences;

/** A fixture player who likes and dislikes nothing. */
const loner = async () => {
  const page = await mockInvoke<PlayerPage>('search_players', { query: '', limit: 500 });
  for (const row of page.rows) {
    if ((await likes(row.uid)).length === 0) {
      return row;
    }
  }
  throw new Error('every fixture player likes something');
};

/** The group as the profile shows it, once the likes are read, and read again after each change. */
function Likes({ uid, name, adds }: { uid: number; name: string; adds: boolean }) {
  const [preferences, setPreferences] = useState<Preference[] | null>(null);
  const read = useCallback(() => void likes(uid).then(setPreferences), [uid]);
  useEffect(read, [read]);
  if (preferences === null) {
    return <p>Reading</p>;
  }
  return (
    <EditorContext.Provider
      value={{
        editable: true,
        readOnlyNote: '',
        onEdited: read,
        gameActions: { ...NO_GAME_ACTIONS, addPreference: adds },
        injuryKinds: async () => [],
        gameDate: null,
        openPlayer: () => {},
        openStaff: () => {},
        findSimilar: () => {},
      }}
    >
      <PreferencesGroup preferences={preferences} person={{ uid, name, staff: false }} />
    </EditorContext.Provider>
  );
}

test('a person with no likes has no group where the game adds none', async () => {
  const { uid, name } = await loner();
  const { container } = render(<Likes uid={uid} name={name} adds={false} />);
  await vi.waitFor(() => expect(container.textContent).toBe(''));
});

test('a club is added to the ones a player favours, and Undo takes it out', async () => {
  const user = userEvent.setup();
  const { uid, name } = await loner();
  render(<Likes uid={uid} name={name} adds />);

  await user.click(await screen.findByRole('button', { name: 'Change' }));
  const dialog = screen.getByRole('dialog');
  // Every kind has its heading and Add, with no rows yet.
  expect(within(dialog).getAllByRole('button', { name: 'Add' })).toHaveLength(4);
  const favoured = within(dialog).getByRole('region', { name: 'Favoured clubs' });
  await user.click(within(favoured).getByRole('button', { name: 'Add' }));

  await user.type(within(dialog).getByRole('combobox', { name: 'Search clubs' }), 'Atl');
  await user.click((await within(dialog).findAllByRole('option', { name: /Atlético Riverside/ }))[0]);

  // The rows come back with the new one, as strong as a like gets, and focus is on the Add it came from.
  const row = await within(dialog).findByRole('textbox', { name: 'Strength for Atlético Riverside' });
  expect((row as HTMLInputElement).value).toBe('100');
  const again = within(within(dialog).getByRole('region', { name: 'Favoured clubs' })).getByRole('button', { name: 'Add' });
  await waitFor(() => expect(document.activeElement).toBe(again));
  expect(await likes(uid)).toMatchObject([{ kind: 'favouredClub', name: 'Atlético Riverside', strength: 100 }]);

  const log = await mockInvoke<LoggedChange[]>('change_log');
  const logged = log.find((change) => change.uid === uid && change.field === 'preference.favouredClub')!;
  expect(logged).toMatchObject({ old: 0, new: 100, tie: { from: null, to: { name: 'Atlético Riverside', value: 100 } } });

  await mockInvoke('undo_change', { id: logged.id });
  expect(await likes(uid)).toEqual([]);
});

test('an add is refused for one in the list, for the person himself and for you', async () => {
  const { uid } = await loner();
  const add = (kind: string, targetKind: string, targetUid: number) =>
    mockInvoke('add_preference', { uid, staff: false, kind, targetKind, targetUid, strength: 100 });
  const you = (await mockInvoke<StaffPage>('search_staff', { query: '', limit: 500, filter: {} })).rows.find(
    (row) => row.isHuman,
  )!;

  await add('dislikedClub', 'club', 500);
  await expect(add('favouredClub', 'club', 500)).rejects.toMatchObject({ code: 'preference.same' });
  await expect(add('favouredPerson', 'player', uid)).rejects.toMatchObject({ code: 'preference.target' });
  await expect(add('favouredPerson', 'staff', you.uid)).rejects.toMatchObject({ code: 'preference.target' });
  await expect(add('favouredPerson', 'club', 500)).rejects.toMatchObject({ code: 'preference.target' });
});
