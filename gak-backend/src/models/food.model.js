const pool = require("../config/db");

async function createFoodImage({ imageId, userId, imageUrl, uploadedAt = null }) {
  if (uploadedAt) {
    await pool.execute(
      `INSERT INTO food_image (image_id, user_id, image_url, uploaded_at)
       VALUES (?, ?, ?, ?)`,
      [imageId, userId, imageUrl, uploadedAt]
    );
    return { imageId, userId, imageUrl, uploadedAt };
  }

  await pool.execute(
    `INSERT INTO food_image (image_id, user_id, image_url)
     VALUES (?, ?, ?)`,
    [imageId, userId, imageUrl]
  );

  return { imageId, userId, imageUrl };
}

async function createDetectedFood({ detectedId, imageId, foodName, confidenceScore = 0.9 }) {
  await pool.execute(
    `INSERT INTO detected_food_item (detected_id, image_id, food_name, confidence_score)
     VALUES (?, ?, ?, ?)`,
    [detectedId, imageId, foodName, confidenceScore]
  );

  return { detectedId, imageId, foodName, confidenceScore };
}

async function detectedItemExists(detectedId) {
  const [rows] = await pool.execute(
    `SELECT detected_id
     FROM detected_food_item
     WHERE detected_id = ?`,
    [detectedId]
  );

  return rows.length > 0;
}

async function detectedItemBelongsToUser(detectedId, userId) {
  const [rows] = await pool.execute(
    `SELECT dfi.detected_id
     FROM detected_food_item dfi
     JOIN food_image fi ON fi.image_id = dfi.image_id
     WHERE dfi.detected_id = ? AND fi.user_id = ?
     LIMIT 1`,
    [detectedId, userId]
  );

  return rows.length > 0;
}

async function confirmFoodItem({ confirmedId, detectedId, quantity, calories, protein, carbs, fats }) {
  await pool.execute(
    `INSERT INTO confirmed_food_item
      (confirmed_id, detected_id, quantity, calories, protein, carbs, fats)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [confirmedId, detectedId, quantity, calories, protein, carbs, fats]
  );
}

async function getDailyNutritionByUser(userId, date) {
  const [rows] = await pool.execute(
    `SELECT
      DATE(fi.uploaded_at) AS log_date,
      ROUND(SUM(cfi.calories * cfi.quantity), 2) AS total_calories,
      ROUND(SUM(cfi.protein * cfi.quantity), 2) AS total_protein,
      ROUND(SUM(cfi.carbs * cfi.quantity), 2) AS total_carbs,
      ROUND(SUM(cfi.fats * cfi.quantity), 2) AS total_fats
     FROM food_image fi
     JOIN detected_food_item dfi ON fi.image_id = dfi.image_id
     JOIN confirmed_food_item cfi ON dfi.detected_id = cfi.detected_id
     WHERE fi.user_id = ? AND DATE(fi.uploaded_at) = ?
     GROUP BY DATE(fi.uploaded_at)`,
    [userId, date]
  );

  return rows[0] || {
    log_date: date,
    total_calories: 0,
    total_protein: 0,
    total_carbs: 0,
    total_fats: 0
  };
}

async function listMealImagesByUserAndDate(userId, date) {
  const [rows] = await pool.execute(
    `SELECT
      fi.image_id,
      fi.uploaded_at,
      ROUND(SUM(cfi.calories * cfi.quantity), 2) AS calories_total,
      GROUP_CONCAT(DISTINCT dfi.food_name ORDER BY dfi.food_name SEPARATOR ', ') AS items
     FROM food_image fi
     JOIN detected_food_item dfi ON fi.image_id = dfi.image_id
     JOIN confirmed_food_item cfi ON dfi.detected_id = cfi.detected_id
     WHERE fi.user_id = ? AND DATE(fi.uploaded_at) = ?
     GROUP BY fi.image_id, fi.uploaded_at
     ORDER BY fi.uploaded_at ASC`,
    [userId, date]
  );

  return rows;
}

module.exports = {
  createFoodImage,
  createDetectedFood,
  detectedItemExists,
  detectedItemBelongsToUser,
  confirmFoodItem,
  getDailyNutritionByUser,
  listMealImagesByUserAndDate
};
