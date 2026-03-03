const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs/promises");

const userModel = require("../models/user.model");
const { signAuthToken } = require("../utils/jwt.util");
const { createId } = require("../utils/id.util");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isStrongPassword(password) {
  const value = String(password || "");
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function buildPublicUploadUrl(...parts) {
  return `/${["uploads", ...parts].map((v) => String(v || "").replace(/^\/+|\/+$/g, "")).join("/")}`;
}

async function deleteLocalProfilePhotoIfPresent(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value.startsWith("/uploads/profile-photos/")) return;
  const relative = value.replace(/^\/+/, "");
  const absPath = path.join(__dirname, "..", "..", relative);
  try {
    await fs.unlink(absPath);
  } catch (_error) {
    // Ignore missing/locked files and keep profile update successful.
  }
}

async function register(req, res, next) {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "fullName, email, password are required" });
    }

    if (fullName.length < 2) {
      return res.status(400).json({ message: "fullName must be at least 2 characters" });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and contain letters and numbers"
      });
    }

    const existing = await userModel.findByEmail(email);

    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = createId("usr");

    await userModel.createUser({
      userId,
      fullName,
      email,
      passwordHash
    });

    return res.status(201).json({
      message: "User created",
      user: { userId, fullName, email, profileImageUrl: null }
    });
  } catch (error) {
    if (error && error.code === "ER_SCHEMA_MISSING_PROFILE_IMAGE") {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const user = await userModel.findByEmail(email);

    if (!user || !user.password_hash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signAuthToken({ userId: user.user_id, email: user.email });

    return res.status(200).json({
      token,
      user: {
        userId: user.user_id,
        fullName: user.full_name,
        email: user.email,
        profileImageUrl: user.profile_image_url || null
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function getProfile(req, res, next) {
  try {
    const userId = req.user.userId;
    const user = await userModel.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    return next(error);
  }
}

async function updateProfilePhoto(req, res, next) {
  try {
    const userId = req.user.userId;
    const existing = await userModel.findById(userId);
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "photo image file is required" });
    }

    const mime = String(req.file.mimetype || "").toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(mime)) {
      return res.status(400).json({ message: "Only jpeg, png, webp, or gif images are supported" });
    }

    const extension = mime.includes("png")
      ? "png"
      : mime.includes("webp")
        ? "webp"
        : mime.includes("gif")
          ? "gif"
          : "jpg";

    const uploadsRoot = path.join(__dirname, "..", "..", "uploads", "profile-photos", userId);
    await fs.mkdir(uploadsRoot, { recursive: true });

    const fileName = `${Date.now()}-${createId("pp")}.${extension}`;
    const absPath = path.join(uploadsRoot, fileName);
    await fs.writeFile(absPath, req.file.buffer);

    const publicUrl = buildPublicUploadUrl("profile-photos", userId, fileName);
    const updated = await userModel.updateProfileImageUrl(userId, publicUrl);
    await deleteLocalProfilePhotoIfPresent(existing.profile_image_url);

    return res.status(200).json({
      message: "Profile photo updated",
      profile: updated
    });
  } catch (error) {
    return next(error);
  }
}

async function exportMyData(req, res, next) {
  try {
    const userId = req.user.userId;
    const payload = await userModel.exportUserData(userId);
    return res.status(200).json(payload);
  } catch (error) {
    return next(error);
  }
}

async function deleteMyAccount(req, res, next) {
  try {
    const userId = req.user.userId;
    const password = String(req.body?.password || "");
    if (!password) {
      return res.status(400).json({ message: "password is required to delete account" });
    }

    const authRow = await userModel.findAuthById(userId);
    if (!authRow || !authRow.password_hash) {
      return res.status(404).json({ message: "User not found" });
    }

    const valid = await bcrypt.compare(password, authRow.password_hash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid password" });
    }

    await userModel.deleteUserData(userId);
    return res.status(200).json({ deleted: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfilePhoto,
  exportMyData,
  deleteMyAccount
};
