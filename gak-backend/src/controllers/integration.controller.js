const integrationService = require("../services/integration.service");

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function normalizeFrontendBaseUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    return `${url.origin}`;
  } catch (_error) {
    return null;
  }
}

function getSafeFrontendBaseUrl() {
  const configured = normalizeFrontendBaseUrl(process.env.FRONTEND_URL || "http://localhost:8080");
  const allowed = String(process.env.FRONTEND_ALLOWED_REDIRECTS || process.env.FRONTEND_URL || "")
    .split(",")
    .map((value) => normalizeFrontendBaseUrl(value))
    .filter(Boolean);

  const runtime = String(process.env.NODE_ENV || "").toLowerCase();
  const inAllowlist = configured && (allowed.length === 0 || allowed.includes(configured));

  if (configured && inAllowlist) {
    const parsed = new URL(configured);
    if (runtime !== "production" || parsed.protocol === "https:" || isLocalHost(parsed.hostname)) {
      return configured;
    }
  }

  if (allowed.length > 0) {
    return allowed[0];
  }

  return "http://localhost:8080";
}

function isOAuthConfigErrorMessage(message) {
  const text = String(message || "");
  return (
    text.includes("Google OAuth config missing")
    || text.includes("GOOGLE_REDIRECT_URI")
    || text.includes("GOOGLE_ALLOWED_REDIRECT_URIS")
    || text.includes("https in production")
  );
}

async function getGoogleAuthUrl(req, res, next) {
  try {
    const authUrl = await integrationService.startGoogleOAuth(req.user.userId);
    return res.status(200).json({ authUrl });
  } catch (error) {
    const message = String(error.message || "");
    if (isOAuthConfigErrorMessage(message)) {
      return res.status(400).json({ message });
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
    const message = String(error.message || "");
    if (isOAuthConfigErrorMessage(message) || message.includes("Invalid OAuth state") || message.includes("Expired OAuth state")) {
      return res.status(400).json({ message });
    }
    return next(error);
  }
}

async function handleGoogleCallbackPublic(req, res, next) {
  try {
    const code = req.query.code;
    const state = req.query.state;
    const frontendUrl = getSafeFrontendBaseUrl();

    if (!code) {
      return res.redirect(`${frontendUrl}/profile?google=error&reason=missing_code`);
    }

    await integrationService.completeGoogleOAuthFromState(code, state);
    return res.redirect(`${frontendUrl}/profile?google=connected`);
  } catch (error) {
    const frontendUrl = getSafeFrontendBaseUrl();
    const reason = encodeURIComponent(String(error?.message || "oauth_failed"));
    return res.redirect(`${frontendUrl}/profile?google=error&reason=${reason}`);
  }
}

async function createCalendarEvent(req, res, next) {
  try {
    const { title, eventType, eventDate, googleAccountId } = req.body;
    const allowedTypes = ["academic", "fitness", "nutrition", "personal"];

    if (!title || !eventType || !eventDate) {
      return res.status(400).json({ message: "title, eventType, eventDate are required" });
    }
    if (!allowedTypes.includes(String(eventType).toLowerCase())) {
      return res.status(400).json({ message: "eventType must be one of academic, fitness, nutrition, personal" });
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(eventDate))) {
      return res.status(400).json({ message: "eventDate must be ISO format (YYYY-MM-DD...)" });
    }

    const result = await integrationService.createCalendarEvent(req.user.userId, { title, eventType, eventDate, googleAccountId });
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

async function listGoogleAccounts(req, res, next) {
  try {
    const payload = await integrationService.listGoogleAccounts(req.user.userId);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
}

async function setPrimaryGoogleAccount(req, res, next) {
  try {
    const accountId = String(req.params.accountId || "");
    if (!accountId) {
      return res.status(400).json({ message: "accountId is required" });
    }
    const payload = await integrationService.setPrimaryGoogleAccount(req.user.userId, accountId);
    return res.status(200).json(payload);
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("not found")) {
      return res.status(404).json({ message: error.message });
    }
    return next(error);
  }
}

async function disconnectGoogleAccount(req, res, next) {
  try {
    const accountId = String(req.params.accountId || "");
    if (!accountId) {
      return res.status(400).json({ message: "accountId is required" });
    }
    const payload = await integrationService.disconnectGoogleAccount(req.user.userId, accountId);
    return res.status(200).json(payload);
  } catch (error) {
    const message = String(error.message || "");
    if (message.toLowerCase().includes("not found")) {
      return res.status(404).json({ message: error.message });
    }
    if (message.toLowerCase().includes("locked")) {
      return res.status(409).json({ message: error.message });
    }
    return next(error);
  }
}

async function setFitGoogleAccount(req, res, next) {
  try {
    const accountId = String(req.body?.accountId || "");
    if (!accountId) {
      return res.status(400).json({ message: "accountId is required" });
    }
    const payload = await integrationService.setFitGoogleAccount(req.user.userId, accountId);
    return res.status(200).json(payload);
  } catch (error) {
    const message = String(error.message || "");
    if (message.toLowerCase().includes("already selected")) {
      return res.status(409).json({ message });
    }
    if (message.toLowerCase().includes("not found")) {
      return res.status(404).json({ message });
    }
    if (message.toLowerCase().includes("required")) {
      return res.status(400).json({ message });
    }
    return next(error);
  }
}

async function parseGmail(req, res, next) {
  try {
    const accountId = req.body?.accountId || req.query?.accountId || null;
    const result = await integrationService.parseGmailForAcademicEvents(req.user.userId, { accountId });
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
      || String(error.message || "").toLowerCase().includes("captcha")
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
  listGoogleAccounts,
  setPrimaryGoogleAccount,
  setFitGoogleAccount,
  disconnectGoogleAccount,
  parseGmail,
  pushWorkoutToFit,
  connectAcademia,
  syncAcademia,
  getAcademiaStatus,
  getAcademiaData
};
