const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");

const userModel = require("../models/user.model");
const { signAuthToken } = require("../utils/jwt.util");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isStrongPassword(password) {
  const value = String(password || "");
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
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
    const userId = randomUUID();

    await userModel.createUser({
      userId,
      fullName,
      email,
      passwordHash
    });

    return res.status(201).json({
      message: "User created",
      user: { userId, fullName, email }
    });
  } catch (error) {
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
        email: user.email
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
  exportMyData,
  deleteMyAccount
};
