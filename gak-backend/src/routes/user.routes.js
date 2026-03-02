const express = require("express");
const rateLimit = require("express-rate-limit");
const multer = require("multer");

const authMiddleware = require("../middleware/auth.middleware");
const userController = require("../controllers/user.controller");

const router = express.Router();
const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const authRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: isProduction ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many authentication attempts. Try again shortly." }
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

router.post("/register", authRateLimit, userController.register);
router.post("/login", authRateLimit, userController.login);
router.get("/me", authMiddleware, userController.getProfile);
router.patch("/me/profile-photo", authMiddleware, upload.single("photo"), userController.updateProfilePhoto);
router.get("/me/export", authMiddleware, userController.exportMyData);
router.delete("/me", authMiddleware, userController.deleteMyAccount);

module.exports = router;
