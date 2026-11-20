import { expect, test } from "vitest";
import { shownValue, storedValue } from "../src/editing";
import { valueText } from "../src/editDraft";
import type { EditField } from "../src/types";

const bits = (value: number): number => new Uint32Array(new Float32Array([value]).buffer)[0];

const price: EditField = {
  key: "finance.ticket_price",
  entity: "club",
  kind: "f32",
  scale: "price",
  min: bits(1),
  max: bits(1000),
  blank: null,
  choices: null,
  mass: false,
};

test("a ticket price is typed and shown with its pence", () => {
  expect(shownValue(price, bits(41.8))).toBe(4180);
  expect(storedValue(price, 4180)).toBe(bits(41.8));
  expect(valueText(price, 4180)).toBe("£41.80");
});

test("a ticket price stays within what the editor writes", () => {
  expect(storedValue(price, 100_001)).toBe(bits(1000));
  expect(storedValue(price, 50)).toBe(bits(1));
});
