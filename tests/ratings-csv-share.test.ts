/**
 * Ratings, the console's CSV export, and the text a trip shares as.
 *
 * All three are pure and all three are places a small mistake is expensive: an
 * average that rounds three ways on three screens, a spreadsheet that runs a
 * commuter's note as a formula, and a shared summary that leaks a fare or an
 * internal id to the wrong person.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import {
  averageScore,
  formatAverage,
  SCORE_VALUES,
  scoreLabel,
} from "../src/lib/ratings.ts";
import { toCsv } from "../src/lib/csv.ts";
import { tripSummary } from "../src/lib/share.ts";

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0);

test("only one to five stars exists", () => {
  expect([...SCORE_VALUES]).toEqual([1, 2, 3, 4, 5]);
});

test("an average is rounded once, to one decimal", () => {
  expect(averageScore([5, 4])).toBe(4.5);
  // 4.333... must not appear on the dashboard as 4.333333333.
  expect(averageScore([4, 4, 5])).toBe(4.3);
  // 31 / 7 = 4.42857...
  expect(averageScore([5, 5, 5, 4, 4, 4, 4])).toBe(4.4);
});

test("a rider nobody has rated is not a rider with a zero", () => {
  // A new rider showing "0.0" reads as a warning, which is a different fact.
  expect(averageScore([])).toBeNull();
  expect(formatAverage([])).toBe("No ratings yet");
  // Values that never came from a rating are ignored rather than averaged in.
  expect(averageScore([0, 9, Number.NaN])).toBeNull();
  expect(averageScore([5, 6])).toBe(5);
});

test("the average reads with its count", () => {
  expect(formatAverage([5, 4, 4])).toBe("4.3 (3)");
});

test("a score has a word, because the console has to act on it", () => {
  expect(scoreLabel(5)).toBe("Excellent");
  expect(scoreLabel(4.2)).toBe("Good");
  expect(scoreLabel(3)).toBe("Fair");
  expect(scoreLabel(2.5)).toBe("Poor");
  expect(scoreLabel(1)).toBe("Needs attention");
});

test("a cell with a comma or a quote survives the round trip", () => {
  const csv = toCsv(["name", "note"], [
    ["Dela Cruz, Juan", 'Said "on the way"'],
  ]);
  // Quoted, with the embedded quote doubled, per RFC 4180.
  expect(csv).toBe(
    'name,note\r\n"Dela Cruz, Juan","Said ""on the way"""\r\n',
  );
});

test("a cell that a spreadsheet would execute is defused", () => {
  const csv = toCsv(["note"], [["=HYPERLINK(\"http://evil\")"], ["+1"], ["@x"]]);
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain("'+1");
  expect(csv).toContain("'@x");
  // A leading apostrophe is the spreadsheet's own escape, so the cell still
  // reads as the text that was typed.
  expect(csv).not.toMatch(/^note\r\n=/m);
});

test("negative numbers are data, not formulas", () => {
  // A cancelled fare adjustment is legitimately negative, and prefixing it
  // would turn a real figure into text.
  const csv = toCsv(["adjustment"], [[-12.5], ["-12.50"]]);
  expect(csv).toBe("adjustment\r\n-12.5\r\n-12.50\r\n");
});

test("an empty cell is empty, and the file ends with a newline", () => {
  const csv = toCsv(["a", "b", "c"], [[null, undefined, ""]]);
  expect(csv).toBe("a,b,c\r\n,,\r\n");
});

test("a shared trip carries what a person waiting needs and nothing else", () => {
  const text = tripSummary(
    {
      code: "FB-0042",
      service: "Ride",
      status: "Rider on the way",
      pickupAddress: "Poblacion, Malaybalay City, Bukidnon",
      destinationAddress: "Fortich St, Malaybalay City, Bukidnon",
      fare: 145.5,
      plate: "ABC 1234",
      riderName: "Rodel",
    },
    NOW,
  );
  expect(text).toContain("FB-0042");
  expect(text).toContain("Poblacion");
  expect(text).toContain("ABC 1234");
  expect(text).toContain("₱145.50");
  // No coordinates and no ids: the person receiving this is at a gate.
  expect(text).not.toMatch(/7\.\d{3}/);
});

test("a trip with no rider yet says nothing about one", () => {
  const text = tripSummary(
    {
      code: "FB-0043",
      service: "Pasugo",
      status: "Looking for a rider",
      pickupAddress: "",
      destinationAddress: "",
      fare: 0,
    },
    NOW,
  );
  expect(text).not.toContain("Rider:");
  // An address nobody typed reads as a dropped pin, not as a blank that looks
  // like the message was cut off.
  expect(text).toContain("Dropped pin");
  // "Pasugo" is the passenger's word for it and must not be title-cased.
  expect(text).toContain("Fetch pasugo FB-0043");
});

test("a scheduled trip says when, and an immediate one does not", () => {
  const base = {
    code: "FB-0044",
    service: "Ride",
    status: "Looking for a rider",
    pickupAddress: "Poblacion",
    destinationAddress: "Malaybalay",
    fare: 90,
  };
  const at = NOW + 3 * 60 * 60 * 1000;
  expect(tripSummary({ ...base, scheduledFor: at }, NOW)).toContain(
    "Pickup time:",
  );
  expect(tripSummary(base, NOW)).not.toContain("Pickup time:");
});
