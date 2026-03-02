const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const scraper = require("../src/utils/academia-scraper.util");
const integrationService = require("../src/services/integration.service");

const fixturesDir = path.join(__dirname, "fixtures", "marks");

function readFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

test("parses marks when course title column is missing", () => {
  const html = readFixture("missing-columns.html");
  const rows = scraper.__debug.parseMarksRows(html);

  assert.equal(rows.length, 4);
  assert.ok(rows.some((row) => row.subjectName === "21MAB204T" && Number(row.score) === 5));
});

test("parses marks with reordered columns via dynamic header map", () => {
  const html = readFixture("reordered-columns.html");
  const rows = scraper.__debug.parseMarksRows(html);

  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.subjectName === "21MAB204T" && Number(row.score) === 5));
  assert.ok(rows.some((row) => row.subjectName === "21PDH209T" && Number(row.score) === 3.4));
});

test("drops AB/null score rows", () => {
  const html = readFixture("ab-null-marks.html");
  const rows = scraper.__debug.parseMarksRows(html);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].subjectName, "21MAB204T");
  assert.equal(Number(rows[0].score), 5);
});

test("handles split-line test performance text blocks", () => {
  const text = readFixture("split-lines.txt");
  const rows = scraper.__debug.parseMarksRowsFromText(text);

  assert.equal(rows.length, 4);
  assert.ok(rows.some((row) => row.subjectName.includes("21CSC206T") && Number(row.score) === 3.8));
});

test("ignores partial/incomplete rows", () => {
  const html = readFixture("partial-rows.html");
  const parsed = scraper.__debug.parseMarksRows(html);
  const rows = integrationService.__test.normalizeMarksRows(parsed, [], []);

  assert.equal(rows.length, 0);
});

test("deduplicates by stable key (term + exam_type + subject_code)", () => {
  const inputRows = [
    { subjectName: "21MAB204T Theory", componentName: "FT-I", score: 5, maxScore: 5, term: "sem4", examType: "FT-I" },
    { subjectName: "21MAB204T", componentName: "FT-I", score: 5, maxScore: 5, term: "sem4", examType: "FT-I" },
    { subjectName: "21MAB204T", componentName: "FT-II", score: 4, maxScore: 5, term: "sem4", examType: "FT-II" }
  ];

  const rows = integrationService.__test.normalizeMarksRows(inputRows, [], []);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.componentName === "FT-I" && Number(row.score) === 5));
  assert.ok(rows.some((row) => row.componentName === "FT-II" && Number(row.score) === 4));
});
