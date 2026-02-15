const app = require("./src/app");
const { bootstrapScheduler } = require("./src/jobs/scheduler");

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`GAK backend running on port ${port}`);
  bootstrapScheduler();
});
