import { createDb } from "@amax/db";
import { createPostgresEngine, workflowRegistry } from "../../src/server";
import { testWorkflows } from "./workflows";

const { db } = createDb(process.env.KILL_TEST_DB!, { max: 2, connection: { options: "-c role=amax_app" } as never });
const engine = createPostgresEngine({ db, registry: workflowRegistry([{ id: "test", workflows: testWorkflows }]), leaseSeconds: 2 });
process.stdout.write("ready\n");
for (;;) await engine.tick();
