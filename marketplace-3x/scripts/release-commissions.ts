/** Exécution manuelle des tâches financières : `npm run jobs:release`. */
import { runFinanceJobs } from "../src/server/services/finance";
runFinanceJobs().then((r) => { console.log(r); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
