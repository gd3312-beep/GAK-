const { randomUUID } = require("crypto");

const marksModel = require("../models/marks.model");
const subjectModel = require("../models/subject.model");

async function addMarks({ userId, subjectId, componentType, score, maxScore }) {
  const subjectExists = await subjectModel.existsById(subjectId);

  if (!subjectExists) {
    throw new Error("Invalid subject_id: subject does not exist");
  }

  if (maxScore <= 0) {
    throw new Error("maxScore must be > 0");
  }

  if (score < 0 || score > maxScore) {
    throw new Error("score must be between 0 and maxScore");
  }

  const marksId = randomUUID();

  await marksModel.createMarksRecord({
    marksId,
    userId,
    subjectId,
    componentType,
    score,
    maxScore
  });

  return { marksId };
}

async function getPerformance(userId) {
  return marksModel.getPerformanceByUser(userId);
}

async function listMarks(userId) {
  return marksModel.listMarksByUser(userId);
}

module.exports = {
  addMarks,
  getPerformance,
  listMarks
};
