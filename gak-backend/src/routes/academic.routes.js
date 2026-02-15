const express = require("express");

const academicController = require("../controllers/academic.controller");

const router = express.Router();

router.get("/subjects", academicController.getSubjects);
router.get("/timetable/:userId", academicController.getTimetable);
router.post("/attendance", academicController.postAttendance);
router.get("/attendance/summary/:userId", academicController.getAttendanceSummary);
router.post("/marks", academicController.postMarks);
router.get("/performance/:userId", academicController.getPerformance);
router.get("/marks/:userId", academicController.getMarks);

module.exports = router;
