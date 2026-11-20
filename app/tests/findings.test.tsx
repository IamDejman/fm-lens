import { expect, test } from "vitest";
import { findings } from "../src/usage";

test("what a version without a profile reports holds addresses and checks, and no counts of the save", () => {
  const found = findings({
    arrays: {
      players: { pairRva: 0x53fae88, count: 31_000, confidence: 0.98 },
      staff: null,
      clubs: { pairRva: 0x53fb040, count: 4_000, confidence: 1 },
      fromProfile: false,
    },
    health: {
      results: [
        { check: "players", passed: true, fit: 400, sampled: 400, note: "ages 15 to 44" },
        { check: "contracts", passed: false, fit: 12, sampled: 400, note: "wages over the cap" },
      ],
    },
  });
  expect(found).toEqual({
    players_at: "0x53fae88",
    players_confidence: 0.98,
    staff_at: "none",
    staff_confidence: 0,
    clubs_at: "0x53fb040",
    clubs_confidence: 1,
    checks_passed: ["players"],
    checks_failed: ["contracts 12/400"],
  });
});
