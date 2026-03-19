const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

const { decrypt } = require("../src/utils/encryption.util");
const { scrapeAcademiaData } = require("../src/utils/academia.scraper.util");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [rows] = await conn.query(
      "SELECT user_id, college_email, password_encrypted FROM academia_account ORDER BY user_id LIMIT 1"
    );
    if (!rows.length) {
      throw new Error("No academia_account rows found");
    }

    const account = rows[0];
    const statePath = path.join(process.cwd(), "tmp", `academia_storage_state_${account.user_id}.enc`);
    const encryptedPayload = fs.readFileSync(statePath, "utf8").trim();
    const storageState = JSON.parse(decrypt(encryptedPayload));
    const scraped = await scrapeAcademiaData({
      collegeEmail: account.college_email,
      collegePassword: decrypt(account.password_encrypted),
      storageState,
      scrapeMode: "marks_attendance"
    });

    console.log(JSON.stringify({
      marks: scraped.marks || [],
      attendance: scraped.attendance || [],
      timings: scraped.timings || null,
      sourceUrl: scraped.sourceUrl || null
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("DEBUG_ACADEMIA_MARKS_FAILED", error && (error.stack || error.message || error));
  process.exit(1);
});
