import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function truncateDatabase() {
  try {
    console.log("🗑️  Starting database truncation...\n");

    // Delete all records from opportunity_packs
    console.log("Truncating opportunity_packs...");
    const opRes = await supabase.from("opportunity_packs").delete().not("id", "is", null);
    if (opRes.error) {
      console.error("Error truncating opportunity_packs:", opRes.error);
    } else {
      const count = opRes.data?.length || 0;
      console.log(`✅ Deleted ${count} opportunity_packs records\n`);
    }

    // Delete all records from collected_articles
    console.log("Truncating collected_articles...");
    const caRes = await supabase.from("collected_articles").delete().not("id", "is", null);
    if (caRes.error) {
      console.error("Error truncating collected_articles:", caRes.error);
    } else {
      const count = caRes.data?.length || 0;
      console.log(`✅ Deleted ${count} collected_articles records\n`);
    }

    // Delete all records from collection_runs
    console.log("Truncating collection_runs...");
    const crRes = await supabase.from("collection_runs").delete().not("id", "is", null);
    if (crRes.error) {
      console.error("Error truncating collection_runs:", crRes.error);
    } else {
      const count = crRes.data?.length || 0;
      console.log(`✅ Deleted ${count} collection_runs records\n`);
    }

    console.log("✨ Database truncation complete!");
  } catch (error) {
    console.error("Fatal error during truncation:", error);
    process.exit(1);
  }
}

truncateDatabase();
