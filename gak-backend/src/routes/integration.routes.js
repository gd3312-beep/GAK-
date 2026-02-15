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
router.post("/gmail/parse", integrationController.parseGmail);
router.post("/fit/workout", integrationController.pushWorkoutToFit);
router.post("/academia/connect", integrationController.connectAcademia);
router.post("/academia/sync", integrationController.syncAcademia);
router.get("/academia/status", integrationController.getAcademiaStatus);
router.get("/academia/data", integrationController.getAcademiaData);

module.exports = router;
