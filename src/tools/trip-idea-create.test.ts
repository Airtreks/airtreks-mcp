import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR ||= mkdtempSync(join(tmpdir(), "airtreks-mcp-test-"));
const { tripIdeaCreate } = await import("./trip-idea-create.js");
const { recordSubmission } = await import("../lib/recent-submissions.js");

const QUESTIONS = [
  { name: "confidence", question: "How confident do you feel booking flights for this trip?", options: ["For sure", "50/50", "Dreaming/Not Confident"] },
  { name: "guidance", question: "How do you want to plan?", options: ["I want expert guidance from humans", "I want automation and algorithms to choose (and then I edit)"] },
];

function seedQuestionsCache(questions: unknown[] = QUESTIONS) {
  writeFileSync(
    join(process.env.DATA_DIR!, "tp-questions.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), questions })
  );
}

const VALID_ANSWERS = {
  confidence: "50/50",
  guidance: "I want expert guidance from humans",
};

beforeEach(() => seedQuestionsCache());

test("reports every missing required field in one pass, including the questionnaire", async () => {
  const result = await tripIdeaCreate({ email: "not-an-email", name: "  ", cities: ["LAX"], dates: [] });
  assert.ok(result.error);
  assert.match(result.error!, /valid customer email/);
  assert.match(result.error!, /full name/);
  assert.match(result.error!, /at least 2 cities/);
  assert.match(result.error!, /planning questions/);
  // the live questions ride along so the agent can ask the customer
  assert.equal((result as any).questions.length, 2);
  assert.deepEqual((result as any).questions[1].options, QUESTIONS[1].options);
});

test("requires a date for every leg, not just the first", async () => {
  const result = await tripIdeaCreate({
    email: "legs@example.com",
    name: "Leg Traveler",
    cities: ["SFO", "NRT", "BKK", "SFO"],
    dates: ["2026-11-10"],
    questionsAnswers: VALID_ANSWERS,
  });
  assert.match(result.error!, /3 dates for 4 cities/);
});

test("an answer that is not one of the question's options is rejected", async () => {
  const result = await tripIdeaCreate({
    email: "opts@example.com",
    name: "Opt Traveler",
    cities: ["SFO", "NRT"],
    dates: ["2026-11-10"],
    questionsAnswers: { confidence: "very!", guidance: "I want expert guidance from humans" },
  });
  assert.match(result.error!, /planning questions/);
  assert.equal((result as any).questions.length, 1);
  assert.equal((result as any).questions[0].name, "confidence");
});

test("with no cached questions and APEX unreachable, the questionnaire is skipped", async () => {
  seedQuestionsCache([]);
  const result = await tripIdeaCreate({
    email: "noq@example.com",
    name: "No Questions",
    cities: ["SFO", "NRT"],
    dates: ["2026-11-10"],
  });
  // passes validation; fails later only because APEX isn't configured in tests
  assert.ok(!result.error || !/planning questions/.test(result.error));
});

test("a recently submitted email+route returns the existing trip idea instead of creating a new one", async () => {
  recordSubmission("dupe@example.com", ["SFO", "SYD", "SFO"], 777);
  const result = await tripIdeaCreate({
    email: "dupe@example.com",
    name: "Dupe Traveler",
    cities: ["SFO", "SYD", "SFO"],
    dates: ["2026-11-10", "2026-11-24"],
    questionsAnswers: VALID_ANSWERS,
  });
  assert.equal(result.success, true);
  assert.equal((result as any).duplicate, true);
  assert.equal(result.tripIdeaId, 777);
});

test("accepts questionsAnswers as a JSON string (stale-schema clients)", async () => {
  recordSubmission("stale@example.com", ["OTP", "MAD", "OTP"], 888);
  const result = await tripIdeaCreate({
    email: "stale@example.com",
    name: "Stale Schema",
    cities: ["OTP", "MAD", "OTP"],
    dates: ["2027-03-04", "2027-03-08"],
    questionsAnswers: JSON.stringify(VALID_ANSWERS),
  });
  // validation passed (answers accepted) — the dedupe hit proves we got past it
  assert.equal((result as any).duplicate, true);
  assert.equal(result.tripIdeaId, 888);
});

test("an unparseable questionsAnswers string is treated as unanswered, not a crash", async () => {
  const result = await tripIdeaCreate({
    email: "garbled@example.com",
    name: "Garbled",
    cities: ["OTP", "MAD"],
    dates: ["2027-03-04"],
    questionsAnswers: "guidance: humans please",
  });
  assert.match(result.error!, /planning questions/);
  assert.equal((result as any).questions.length, 2);
});
