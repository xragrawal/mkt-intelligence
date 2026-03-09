import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  try {
    const [
      { count: opCount, error: opErr },
      { count: caCount, error: caErr },
      { count: crCount, error: crErr },
    ] = await Promise.all([
      supabase
        .from("opportunity_packs")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("collected_articles")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("collection_runs")
        .select("*", { count: "exact", head: true }),
    ]);

    if (opErr || caErr || crErr) {
      console.error("Errors:", { opErr, caErr, crErr });
      return;
    }

    console.log(`📊 Database Status:`);
    console.log(`  - opportunity_packs: ${opCount || 0} records`);
    console.log(`  - collected_articles: ${caCount || 0} records`);
    console.log(`  - collection_runs: ${crCount || 0} records`);

    if ((opCount || 0) + (caCount || 0) + (crCount || 0) === 0) {
      console.log(`\n✅ Database is clean! Ready for fresh e2e testing.`);
    }
  } catch (error) {
    console.error("Error checking database:", error);
  }
}

checkDatabase();
