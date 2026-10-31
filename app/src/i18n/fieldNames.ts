// The names a dictionary gives the editable fields, for the sentences of its `errors`. The panels name fields through
// `fieldLabel` in labels.ts; a failure does not say whose field it was, so players' attributes are tried before
// those of staff.

import type { Strings } from "./en";

/** The text of `table` for `key`; nothing for a key the table lacks, however it is spelled (e.g. "constructor"). */
function own(table: object, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? (table as Record<string, string>)[key] : undefined;
}

/** The name `dict` gives the field `key` ("contract.wage", "attribute.finishing", …); an unknown key as it is. */
export function fieldName(dict: Strings, key: string): string {
  const fixed = own(dict.fields, key);
  if (fixed !== undefined) {
    return fixed;
  }
  const [group, name = ""] = key.split(".");
  switch (group) {
    case "attribute":
      return own(dict.attributes, name) ?? own(dict.staffAttributes, name) ?? key;
    case "personality":
      return own(dict.personality, name) ?? key;
    case "position": {
      const position = own(dict.positions, name);
      return position === undefined ? key : dict.edit.positionRating(position);
    }
    default:
      return key;
  }
}
