const test = require("node:test");
const assert = require("node:assert/strict");

const { parseWorkoutPlanPdf } = require("../src/utils/workout-plan.util");

async function parseFromText(text, fileName = "workout.pdf") {
  return parseWorkoutPlanPdf({
    pdfParse: async () => ({ text }),
    buffer: Buffer.from("fixture"),
    fileName
  });
}

test("captures Push/Pull section titles as day labels", async () => {
  const parsed = await parseFromText(`
PPL Program
Push Day
Bench Press 4 x 8-10
Incline Dumbbell Press 3 x 10
Pull Day
Lat Pulldown 4 x 10
Barbell Row 4 x 8
`);

  assert.equal(parsed.planName, "PPL Program");
  assert.equal(parsed.exercises.length, 4);
  assert.equal(parsed.exercises[0].dayLabel, "Push");
  assert.equal(parsed.exercises[1].dayLabel, "Push");
  assert.equal(parsed.exercises[2].dayLabel, "Pull");
  assert.equal(parsed.exercises[3].dayLabel, "Pull");
});

test("supports day headers and inline labels in exercise lines", async () => {
  const parsed = await parseFromText(`
Workout Split Program
Day 1 - Push
Push - Overhead Press 4 x 8
Lateral Raise - 3 sets 15 reps
Day 2 - Pull
Pull - Barbell Row 4 x 8
`);

  assert.equal(parsed.exercises.length, 3);
  assert.equal(parsed.exercises[0].dayLabel, "Push");
  assert.equal(parsed.exercises[0].exerciseName, "Overhead Press");
  assert.equal(parsed.exercises[1].dayLabel, "Day 1 - Push");
  assert.equal(parsed.exercises[2].dayLabel, "Pull");
});

test("captures DO-based section headers and set-only exercise lines", async () => {
  const parsed = await parseFromText(`
Final DO-Based Rotation Gym System
DO1 - Morning Push (7:00-8:15 AM)
Barbell Bench Press - 4 x 6-8
Shoulder Press - 3 x 8-10
Saturday - Heavy Pull + Arms (90 Minutes)
Pull-ups - 4 sets
Lat Pulldown (Heavy) - 3 x 6-8
`);

  assert.equal(parsed.exercises.length, 4);
  assert.equal(parsed.exercises[0].dayLabel, "DO1 - Push");
  assert.equal(parsed.exercises[1].dayLabel, "DO1 - Push");
  assert.equal(parsed.exercises[2].dayLabel, "Saturday - Pull");
  assert.equal(parsed.exercises[2].sets, 4);
  assert.equal(parsed.exercises[2].reps, null);
});

test("ignores bodyweight numbers when estimating calories", async () => {
  const parsed = await parseFromText(`
Estimated Calorie Burn (77 kg bodyweight):
DO1 Morning Push (75 min): ~350-450 kcal
DO2 Evening Pull (75 min): ~350-450 kcal
`);

  assert.equal(parsed.estimatedCaloriesBurned, 400);
});
