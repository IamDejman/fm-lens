// Names checked in FM27 Steam 26340721: docs/recon/fm27-staff-extras.md
// and docs/EDITING-VALIDATION.md (7 and 8 November). Unmapped IDs show as an unknown formation, never as a number.
const NAMES: Readonly<Record<number, string>> = {
  3: "4-4-2",
  4: "4-3-3 DM Wide",
  7: "4-4-2 Diamond Narrow",
  22: "4-4-2 2DM",
  27: "4-3-2-1 DM AM Narrow",
  28: "4-2-4 DM Wide",
  29: "4-2-3-1 DM AM Wide",
  30: "5-3-2 DM WB",
  32: "4-1-4-1 DM",
  33: "4-4-1-1 2DM",
  35: "5-2-3 DM Wide",
  62: "4-2-2-2 DM AM Narrow",
  63: "5-2-2-1 DM AM",
  64: "5-2-1-2 DM AM",
  65: "3-2-5 DM 2AM Wide",
};

export const knownFormationName = (id: number): string | undefined => NAMES[id];
