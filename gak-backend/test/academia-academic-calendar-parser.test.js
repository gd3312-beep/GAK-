const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const scraper = require("../src/utils/academia-scraper.util");

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", "academic-calendar", name), "utf8");
}

test("parses academic planner month grid (Dt/Day/Month/DO) into dated calendar rows", () => {
  const html = readFixture("planner-grid.html");
  const rows = scraper.__debug.parseAcademicCalendarRowsFromHtml(html);

  assert.ok(rows.some((row) => row.date === "2026-01-01" && Number(row.dayOrder || 0) === 0 && /holiday/i.test(row.description)));
  assert.ok(rows.some((row) => row.date === "2026-01-02" && row.dayOrder === 1));
  assert.ok(rows.some((row) => row.date === "2026-02-02" && row.dayOrder === 5));
  assert.ok(rows.some((row) => row.date === "2026-02-03" && /mid sem exam/i.test(row.description)));
});
