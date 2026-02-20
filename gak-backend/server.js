const app = require("./src/app");
const { bootstrapScheduler } = require("./src/jobs/scheduler");

const port = process.env.PORT || 4000;
// In some locked-down environments binding to 0.0.0.0 is blocked.
// Default to loopback; set HOST=0.0.0.0 in production containers when needed.
const host = process.env.HOST || "127.0.0.1";

app.listen(port, host, () => {
  console.log(`GAK backend running on http://${host}:${port}`);
  bootstrapScheduler();
});
