import { useCallback, useEffect, useState } from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockInvoke } from '../src/dev/mock';
import { LanguagesGroup } from '../src/RelationGroups';
import type { Language, LoggedChange, PlayerDetails, PlayerPage } from '../src/types';
import { EditorContext, NO_GAME_ACTIONS } from '../src/useProfileEditing';

const spoken = async (uid: number) => (await mockInvoke<PlayerDetails>('player_details', { uid })).languages;

/** A fixture player whose list of languages has `count` of them. */
const speaker = async (count: number) => {
  const page = await mockInvoke<PlayerPage>('search_players', { query: '', limit: 500 });
  for (const row of page.rows) {
    if ((await spoken(row.uid)).length === count) {
      return row;
    }
  }
  throw new Error(`no fixture player speaks ${count} languages`);
};

/** The group as the profile shows it, once the languages are read, and read again after each change. */
function Languages({ uid, name, adds }: { uid: number; name: string; adds: boolean }) {
  const [languages, setLanguages] = useState<Language[] | null>(null);
  const read = useCallback(() => void spoken(uid).then(setLanguages), [uid]);
  useEffect(read, [read]);
  if (languages === null) {
    return <p>Reading</p>;
  }
  return (
    <EditorContext.Provider
      value={{
        editable: true,
        readOnlyNote: '',
        onEdited: read,
        gameActions: { ...NO_GAME_ACTIONS, addLanguage: adds },
        injuryKinds: async () => [],
        gameDate: null,
        openPlayer: () => {},
        openStaff: () => {},
        findSimilar: () => {},
      }}
    >
      <LanguagesGroup languages={languages} person={{ uid, name, staff: false }} />
    </EditorContext.Provider>
  );
}

test('a person with no languages has no group where the game adds none', async () => {
  const { uid, name } = await speaker(0);
  const { container } = render(<Languages uid={uid} name={name} adds={false} />);
  await vi.waitFor(() => expect(container.textContent).toBe(''));
});

test('a list the game adds nothing to has no Add', async () => {
  const user = userEvent.setup();
  const { uid, name } = await speaker(1);
  render(<Languages uid={uid} name={name} adds={false} />);
  await user.click(await screen.findByRole('button', { name: 'Change' }));
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Add' })).toBeNull();
});

test('a language is added to an empty list, and Undo takes it out', async () => {
  const user = userEvent.setup();
  const { uid, name } = await speaker(0);
  render(<Languages uid={uid} name={name} adds />);

  await user.click(await screen.findByRole('button', { name: 'Change' }));
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Add' }));

  await user.type(within(dialog).getByRole('combobox', { name: 'Search languages' }), 'cat');
  await user.click(await within(dialog).findByRole('option', { name: 'Catalan' }));

  // The rows come back with the new one, spoken as well as a language gets, and focus is on Add again.
  const row = await within(dialog).findByRole('textbox', { name: 'Level of Catalan' });
  expect((row as HTMLInputElement).value).toBe('10');
  await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Add' })));
  expect(await spoken(uid)).toMatchObject([{ name: 'Catalan', level: 10 }]);

  const log = await mockInvoke<LoggedChange[]>('change_log');
  const logged = log.find((change) => change.uid === uid && change.field === 'language')!;
  expect(logged).toMatchObject({ old: 0, new: 10, tie: { from: null, to: { name: 'Catalan', value: 10 } } });

  await mockInvoke('undo_change', { id: logged.id });
  expect(await spoken(uid)).toEqual([]);
});

test('the search leaves out the languages the list has', async () => {
  const user = userEvent.setup();
  const { uid, name } = await speaker(1);
  const [held] = await spoken(uid);
  render(<Languages uid={uid} name={name} adds />);

  await user.click(await screen.findByRole('button', { name: 'Change' }));
  const dialog = screen.getByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Add' }));
  await user.type(within(dialog).getByRole('combobox', { name: 'Search languages' }), held.name!);
  expect(await within(dialog).findByText(/Nothing matches/)).toBeTruthy();
  expect(within(dialog).queryByRole('option', { name: held.name! })).toBeNull();
});

test('an add is refused for a language in the list and for the person\'s own', async () => {
  const { uid } = await speaker(1);
  const [held] = await spoken(uid);
  const add = (name: string) => mockInvoke('add_language', { uid, staff: false, name, level: 10 });

  await expect(add(held.name!)).rejects.toMatchObject({ code: 'language.same' });
  await expect(add('Italian')).rejects.toMatchObject({ code: 'language.own' });
  await expect(add('Klingon')).rejects.toMatchObject({ code: 'app.dataChanged' });
});
