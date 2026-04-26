const { verifyAuthToken } = require("../utils/jwt.util");
const authSessionModel = require("../models/auth-session.model");

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAuthToken(token);
    const sessionId = String(payload?.sid || "");
    if (!sessionId) {
      return res.status(401).json({ message: "Invalid session" });
    }
    const session = await authSessionModel.getSessionById(sessionId);
    if (!session || session.user_id !== payload.userId || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ message: "Session expired. Please sign in again." });
    }
    await authSessionModel.touchSession(sessionId);
    req.user = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = authMiddleware;
