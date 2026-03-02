const express = require("express");

const integrationController = require("../controllers/integration.controller");

const router = express.Router();

router.get("/google/auth-url", integrationController.getGoogleAuthUrl);
router.post("/google/callback", integrationController.handleGoogleCallback);
router.get("/google/accounts", integrationController.listGoogleAccounts);
router.post("/google/accounts/:accountId/primary", integrationController.setPrimaryGoogleAccount);
router.delete("/google/accounts/:accountId", integrationController.disconnectGoogleAccount);
router.post("/fit/account", integrationController.setFitGoogleAccount);
router.get("/status", integrationController.getIntegrationStatus);
router.post("/calendar/events", integrationController.createCalendarEvent);
router.get("/calendar/events", integrationController.listCalendarEvents);
router.post("/calendar/sync", integrationController.syncGoogleCalendar);
router.post("/gmail/parse", integrationController.parseGmail);
router.post("/fit/workout", integrationController.pushWorkoutToFit);
router.post("/academia/connect", integrationController.connectAcademia);
router.post("/academia/capture-session", integrationController.captureAcademiaSession);
router.post("/academia/sync", integrationController.syncAcademia);
router.post("/academia/sync-reports", integrationController.syncAcademiaReports);
router.get("/academia/status", integrationController.getAcademiaStatus);
router.get("/academia/data", integrationController.getAcademiaData);
router.get("/academic-sources", integrationController.listAcademicSources);
router.post("/academic-sources/register", integrationController.registerAcademicSource);
router.delete("/academic-sources/:enrollmentId", integrationController.removeAcademicSource);

module.exports = router;
