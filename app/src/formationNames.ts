// Names checked in FM27 Steam 26340721: docs/recon/fm27-staff-extras.md
// and docs/EDITING-VALIDATION.md (7 November). Unmapped IDs must stay explicit.
const NAMES: Readonly<Record<number, string>> = {
  4: "4-3-3 DM Wide",
  7: "4-4-2 Diamond Narrow",
  22: "4-4-2 2DM",
  28: "4-2-4 DM Wide",
  29: "4-2-3-1 DM AM Wide",
  30: "5-3-2 DM WB",
  63: "5-2-2-1 DM AM",
};

export const knownFormationName = (id: number): string | undefined => NAMES[id];
