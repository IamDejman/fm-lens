// The app menu on macOS: the one Tauri gives by default, with Check for Updates… under About FM Lens, where Mac apps
// put it. Changing language reloads the window, which builds the menu again in the new language.

import { Menu, Submenu } from "@tauri-apps/api/menu";

/** Puts Check for Updates… (`text`) in the app menu, calling `onCheck` when chosen. */
export async function addCheckForUpdates(text: string, onCheck: () => void): Promise<void> {
  const menu = await Menu.default();
  const [appMenu] = await menu.items();
  if (!(appMenu instanceof Submenu)) {
    return;
  }
  await appMenu.insert({ id: "check-for-updates", text, action: onCheck }, 1);
  await menu.setAsAppMenu();
}
