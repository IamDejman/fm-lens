import type { CSSProperties } from "react";
import { profileText } from "./labels";

/** Current or potential ability (1–200) with a bar; negative potentials are ranges. */
export function Ability({ value }: { value: number }) {
  if (value < 0) {
    return (
      <span className="ability range" title={profileText.potentialRange}>
        {value}
      </span>
    );
  }
  const style = { "--fill": `${Math.min(100, value / 2)}%` } as CSSProperties;
  return (
    <span className="ability" style={style}>
      {value}
    </span>
  );
}
