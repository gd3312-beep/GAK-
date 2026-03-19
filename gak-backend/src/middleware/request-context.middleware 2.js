const { createId } = require("../utils/id.util");

function requestContextMiddleware(req, res, next) {
  const requestId = String(req.headers["x-request-id"] || createId("req"));
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

module.exports = requestContextMiddleware;
