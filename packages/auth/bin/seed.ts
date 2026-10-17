import postgres from "postgres";
import { seedFirstTenant } from "../src/seed";

const url = process.env.DATABASE_MIGRATE_URL;
if (!url) {
  console.error("amax: set DATABASE_MIGRATE_URL (the schema owner) to seed the first tenant");
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const r = await seedFirstTenant(sql, process.env);
  console.log(r.created ? `seeded tenant ${r.tenantId}` : `tenant ${r.tenantId} already seeded`);
} finally {
  await sql.end();
}
