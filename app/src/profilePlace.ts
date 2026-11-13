// Where an open profile is scrolled to, kept by its list: a list that is not on show has no profile, so the profile
// is built again on coming back to its section, and goes back to where it was.

import { createContext } from "react";

export interface ProfilePlace {
  /** How far down the profile was when it was last on show; 0 for one that is opened anew. */
  top: () => number;
  /** Called as the profile scrolls. */
  note: (top: number) => void;
}

/** The place of the profile around the reader; null where no list keeps it. */
export const ProfilePlaceContext = createContext<ProfilePlace | null>(null);
