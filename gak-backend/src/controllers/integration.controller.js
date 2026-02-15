const integrationService = require("../services/integration.service");

async function getGoogleAuthUrl(req, res, next) {
  try {
    const authUrl = await integrationService.startGoogleOAuth(req.user.userId);
    return res.status(200).json({ authUrl });
  } catch (error) {
    if (String(error.message || "").includes("Google OAuth config missing")) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}

async function handleGoogleCallback(req, res, next) {
  try {
    const code = req.body.code || req.query.code;

    if (!code) {
      return res.status(400).json({ message: "code is required" });
    }

    const result = await integrationService.completeGoogleOAuth(code, req.user.userId);
    return res.status(200).json(result);
  } catch (error) {
    if (String(error.message || "").includes("Google OAuth config missing")) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}

async function handleGoogleCallbackPublic(req, res, next) {
  try {
    const code = req.query.code;
    const state = req.query.state;
    const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");

    if (!code) {
      return res.redirect(`${frontendUrl}/profile?google=error&reason=missing_code`);
    }

    await integrationService.completeGoogleOAuthFromState(code, state);
    return res.redirect(`${frontendUrl}/profile?google=connected`);
  } catch (error) {
    const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:8080").replace(/\/$/, "");
    const reason = encodeURIComponent(String(error?.message || "oauth_failed"));
    return res.redirect(`${frontendUrl}/profile?google=error&reason=${reason}`);
  }
}

async function createCalendarEvent(req, res, next) {
  try {
    const { title, eventType, eventDate } = req.body;

    if (!title || !eventType || !eventDate) {
      return res.status(400).json({ message: "title, eventType, eventDate are required" });
    }

    const result = await integrationService.createCalendarEvent(req.user.userId, { title, eventType, eventDate });
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

async function listCalendarEvents(req, res, next) {
  try {
    const rows = await integrationService.getCalendarEvents(req.user.userId);
    return res.status(200).json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getIntegrationStatus(req, res, next) {
  try {
    const status = await integrationService.getIntegrationStatus(req.user.userId);
    return res.status(200).json(status);
  } catch (error) {
    return next(error);
  }
}

async function parseGmail(req, res, next) {
  try {
    const result = await integrationService.parseGmailForAcademicEvents(req.user.userId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function pushWorkoutToFit(req, res, next) {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const result = await integrationService.pushWorkoutToGoogleFit(req.user.userId, sessionId);
    return res.status(200).json(result);
  } catch (error) {
    if (String(error.message || "").includes("Invalid session_id")) {
      return res.status(400).json({ message: error.message });
    }

    return next(error);
  }
}

async function connectAcademia(req, res, next) {
  try {
    const { collegeEmail, collegePassword } = req.body;

    if (!collegeEmail || !collegePassword) {
      return res.status(400).json({ message: "collegeEmail and collegePassword are required" });
    }

    const result = await integrationService.connectAcademiaCredentials(req.user.userId, { collegeEmail, collegePassword });
    return res.status(200).json(result);
  } catch (error) {
    if (String(error.message || "").includes("required")) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}

async function syncAcademia(req, res, next) {
  try {
    const result = await integrationService.syncAcademiaData(req.user.userId);
    return res.status(200).json(result);
  } catch (error) {
    if (
      String(error.message || "").includes("not connected")
      || String(error.message || "").includes("failed")
      || String(error.message || "").includes("Unable to fetch")
    ) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}

async function getAcademiaStatus(req, res, next) {
  try {
    const status = await integrationService.getAcademiaStatus(req.user.userId);
    return res.status(200).json(status);
  } catch (error) {
    return next(error);
  }
}

async function getAcademiaData(req, res, next) {
  try {
    const payload = await integrationService.getAcademiaData(req.user.userId);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getGoogleAuthUrl,
  handleGoogleCallback,
  handleGoogleCallbackPublic,
  createCalendarEvent,
  listCalendarEvents,
  getIntegrationStatus,
  parseGmail,
  pushWorkoutToFit,
  connectAcademia,
  syncAcademia,
  getAcademiaStatus,
  getAcademiaData
};
