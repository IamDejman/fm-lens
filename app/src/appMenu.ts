// The app menu on macOS: the one Tauri gives by default, with Check for Updates… under About FM Lens, where Mac apps
// put it, and Support FM Lens under Help. Changing language reloads the window, which builds the menu again in the new
// language.

import { Menu, Submenu } from "@tauri-apps/api/menu";

/** The id Tauri gives the default menu's Help. */
const HELP_MENU = "__tauri_help_menu__";

/** Puts Check for Updates… (`check`) in the app menu and Support FM Lens (`support`) in Help, each with its action. */
export async function addMenuItems(items: {
  check: string;
  onCheck: () => void;
  support: string;
  onSupport: () => void;
}): Promise<void> {
  const menu = await Menu.default();
  const [appMenu] = await menu.items();
  if (!(appMenu instanceof Submenu)) {
    return;
  }
  await appMenu.insert({ id: "check-for-updates", text: items.check, action: items.onCheck }, 1);
  const help = await menu.get(HELP_MENU);
  if (help instanceof Submenu) {
    await help.append({ id: "support", text: items.support, action: items.onSupport });
  }
  await menu.setAsAppMenu();
}
