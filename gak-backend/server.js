const app = require("./src/app");
const { bootstrapScheduler } = require("./src/jobs/scheduler");

const port = process.env.PORT || 4000;

function startServer(host) {
  const server = app.listen(port, host, () => {
    console.log(`GAK backend running on http://${host}:${port}`);
    bootstrapScheduler();
  });

  server.on("error", (error) => {
    const code = String(error?.code || "");
    if ((code === "EPERM" || code === "EACCES") && host !== "127.0.0.1") {
      console.warn(`Host ${host} bind failed (${code}); retrying on 127.0.0.1`);
      startServer("127.0.0.1");
      return;
    }
    throw error;
  });
}

const preferredHost = process.env.HOST || "0.0.0.0";
startServer(preferredHost);
