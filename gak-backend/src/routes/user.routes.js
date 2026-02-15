const express = require("express");
const rateLimit = require("express-rate-limit");

const authMiddleware = require("../middleware/auth.middleware");
const userController = require("../controllers/user.controller");

const router = express.Router();
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false
});

router.post("/register", authRateLimit, userController.register);
router.post("/login", authRateLimit, userController.login);
router.get("/me", authMiddleware, userController.getProfile);
router.get("/me/export", authMiddleware, userController.exportMyData);
router.delete("/me", authMiddleware, userController.deleteMyAccount);

module.exports = router;
