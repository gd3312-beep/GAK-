const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config();

function readSslConfig() {
  const mode = String(process.env.DB_SSL_MODE || "").trim().toLowerCase();
  if (!mode || mode === "false" || mode === "off" || mode === "disabled") {
    return undefined;
  }

  const rejectUnauthorized =
    String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "true").trim().toLowerCase() !== "false";

  // mysql2 enables TLS when ssl is an object; most managed MySQL providers
  // (including TiDB Cloud) work with platform trust store by default.
  return {
    rejectUnauthorized
  };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: readSslConfig(),
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
