const { verifyAuthToken } = require("../utils/jwt.util");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAuthToken(token);
    req.user = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = authMiddleware;
