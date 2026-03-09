import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log("🔗 Testing Supabase Connection...\n");

  try {
    // Test 1: Basic connection
    console.log("Test 1: Basic Health Check");
    const healthCheck = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (healthCheck.ok) {
      console.log("✅ Health check passed (HTTP 200)\n");
    } else {
      console.log(`❌ Health check failed (HTTP ${healthCheck.status})`);
      console.log(`Response: ${await healthCheck.text()}\n`);
    }

    // Test 2: List tables
    console.log("Test 2: Checking Database Tables");
    const tables = [
      "collected_articles",
      "collection_runs",
      "opportunity_packs",
      "flytbase_partners",
      "market_trends",
    ];

    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: ${count} records`);
      }
    }

    console.log("\n✨ Supabase connection test complete!");
    console.log("\nProject Details:");
    console.log(`📍 URL: ${supabaseUrl}`);
    console.log(`🔑 Project ID: ${supabaseUrl.split("://")[1].split(".")[0]}`);
  } catch (error: any) {
    console.error("\n❌ Connection test failed:");
    console.error(error.message);
    process.exit(1);
  }
}

testConnection();
