const test = require("node:test");
const assert = require("node:assert/strict");

const { extractDeadline, buildAcademicDeadlineTitle } = require("../src/utils/email.util");

function formatDmy(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function isoDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function localDateOnly(date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

test("extractDeadline prefers final closing date over open date", () => {
  const now = new Date();
  const openDate = new Date(now);
  openDate.setDate(now.getDate() + 5);
  const closeDate = new Date(now);
  closeDate.setDate(now.getDate() + 12);

  const parsed = extractDeadline(
    `Assignment submission window opens on ${formatDmy(openDate)} and closes on ${formatDmy(closeDate)}.`
  );

  assert.ok(parsed instanceof Date);
  assert.equal(localDateOnly(parsed), localDateOnly(closeDate));
});

test("extractDeadline prefers extended-until date", () => {
  const now = new Date();
  const oldDate = new Date(now);
  oldDate.setDate(now.getDate() + 4);
  const extendedDate = new Date(now);
  extendedDate.setDate(now.getDate() + 9);

  const parsed = extractDeadline(
    `Submission deadline was ${formatDmy(oldDate)}. Deadline extended until ${formatDmy(extendedDate)}.`
  );

  assert.ok(parsed instanceof Date);
  assert.equal(localDateOnly(parsed), localDateOnly(extendedDate));
});

test("extractDeadline resolves relative deadline phrases", () => {
  const parsed = extractDeadline("Assignment deadline tomorrow at 11:59 PM.");
  assert.ok(parsed instanceof Date);

  const expected = new Date();
  expected.setDate(expected.getDate() + 1);
  assert.equal(localDateOnly(parsed), localDateOnly(expected));
});

test("extractDeadline prefers explicit range end date over 'tomorrow' token", () => {
  const reference = new Date("2026-02-12T10:00:00+05:30");
  const parsed = extractDeadline(
    'New assignment: "From tomorrow, 13 February, till 20"',
    reference
  );
  assert.ok(parsed instanceof Date);
  assert.equal(localDateOnly(parsed), "2026-02-20");
});

test("extractDeadline uses message reference date for relative phrases", () => {
  const reference = new Date("2026-02-12T10:00:00+05:30");
  const parsed = extractDeadline("Assignment deadline tomorrow at 11:59 PM.", reference);
  assert.ok(parsed instanceof Date);
  assert.equal(localDateOnly(parsed), "2026-02-13");
});

test("buildAcademicDeadlineTitle normalizes noisy subject to clean label", () => {
  const title = buildAcademicDeadlineTitle({
    subject: "New assignment: 21MAB204T - FT-I /5.00 due tomorrow",
    snippet: "Submit before 11:59 PM",
    bodyText: "",
    source: { sourceName: "Google Classroom", providerCode: "classroom" }
  });

  assert.equal(title, "Classroom Assignment: 21MAB204T - FT-I");
});

test("buildAcademicDeadlineTitle includes subject and assessment from announcement", () => {
  const title = buildAcademicDeadlineTitle({
    subject: "Artificial Intelligence: Knowledge Representation And Reasoning : Content & Assignment 6 is live now!!",
    snippet: "Submission deadline 04/03/2026",
    bodyText: "",
    source: { sourceName: "NPTEL", providerCode: "nptel" }
  });

  assert.equal(title, "NPTEL Assignment: Artificial Intelligence: Knowledge Representation And Reasoning - Assignment 6");
});

test("buildAcademicDeadlineTitle keeps college exam registration categorized", () => {
  const title = buildAcademicDeadlineTitle({
    subject: "Exam registration for 21CSE251T closes on 12/03/2026",
    snippet: "Register by tonight",
    bodyText: "",
    source: { sourceName: "SRM Academia", providerCode: "college" }
  });

  assert.equal(title, "College Exam Registration: 21CSE251T");
});

test("buildAcademicDeadlineTitle captures NPTEL week assignment labels", () => {
  const title = buildAcademicDeadlineTitle({
    subject: "Week 5 content & assignment is live now!!",
    snippet: "Course: Database Management Systems",
    bodyText: "Submission deadline 14/03/2026",
    source: { sourceName: "NPTEL", providerCode: "nptel" }
  });

  assert.ok(title.includes("NPTEL Assignment"));
  assert.ok(title.includes("Week 5 Assignment"));
});
