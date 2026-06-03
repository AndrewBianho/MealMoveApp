// Manual / external-scheduler entry point for the anti-flaking sweep.
//   npm run sweep
import { runSweep } from "../lib/sweep";

runSweep()
  .then((r) => {
    console.log("Sweep complete:", r);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
