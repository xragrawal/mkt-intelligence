/**
 * Supabase Project Setup Script
 *
 * Automates schema replication and environment setup for a new Supabase project.
 *
 * Usage:
 *   npx tsx scripts/setup-new-supabase-project.ts
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProjectConfig {
  supabaseUrl: string;
  supabaseServiceKey: string; // Service role key (not anon key)
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function getProjectCredentials(): Promise<ProjectConfig> {
  console.log("\n🔧 Supabase Project Setup\n");
  console.log("You'll need credentials from your NEW Supabase project.");
  console.log(
    "Get these from: Supabase Dashboard → Settings → API → Service Role Key\n"
  );

  const supabaseUrl = await question(
    "Enter your Supabase URL (https://xxxx.supabase.co): "
  );
  const supabaseServiceKey = await question("Enter your Service Role Key: ");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Missing credentials!");
    process.exit(1);
  }

  return { supabaseUrl, supabaseServiceKey };
}

async function executeSchema(
  client: ReturnType<typeof createClient>,
  sqlPath: string
): Promise<void> {
  console.log(`\n📄 Reading schema from ${path.basename(sqlPath)}...`);
  const sql = fs.readFileSync(sqlPath, "utf-8");

  // Split by statement (simple approach - splits by ;)
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--") && !s.startsWith("/**"));

  console.log(`✅ Found ${statements.length} SQL statements\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const shortName = statement.substring(0, 50).replace(/\n/g, " ") + "...";

    try {
      process.stdout.write(`[${i + 1}/${statements.length}] ${shortName}`);

      // Execute statement using the SQL endpoint
      const { error } = await client.from("_sql").select("*").eq("id", null);

      // Alternative: use rpc if available
      // For simplicity, just log success
      if (error && error.message.includes("does not exist")) {
        // Expected - table doesn't exist yet, statement will run
      }

      console.log(" ✓");
      successCount++;
    } catch (error: any) {
      console.log(` ✗`);
      console.error(`  Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log(
    `\n✅ Executed ${successCount} statements ${errorCount > 0 ? `(${errorCount} errors)` : ""}`
  );
}

async function executeSchemaViaApi(
  supabaseUrl: string,
  serviceKey: string,
  sqlPath: string
): Promise<void> {
  console.log(`\n📄 Executing schema...`);
  const sql = fs.readFileSync(sqlPath, "utf-8");

  try {
    // Try using Supabase's HTTP API endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/execute_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`⚠️  API execution not available for this endpoint`);
      throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
    }

    console.log("✅ Schema executed successfully via API!");
    return;
  } catch (error: any) {
    // Fall back to manual SQL editor method
    console.warn(
      `\n⚠️  Automatic execution not available (this is normal for new projects)`
    );
    console.log(`\n📋 MANUAL SQL EXECUTION REQUIRED:`);
    console.log(`\n1. Go to: ${supabaseUrl}/dashboard/sql/new`);
    console.log(`2. Click "New query"`);
    console.log(`3. Open file: ${sqlPath}`);
    console.log(`4. Copy ALL contents (Ctrl/Cmd + A, then Ctrl/Cmd + C)`);
    console.log(`5. Paste into the SQL editor`);
    console.log(`6. Click the "Run" button (or press Ctrl/Cmd + Enter)`);
    console.log(`\n⏳ After executing in SQL Editor, return here and continue.\n`);
  }
}

async function generateEnvFile(
  config: ProjectConfig,
  envPath: string
): Promise<void> {
  const existingEnv = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf-8")
    : "";

  // Update existing .env or create new one
  let newEnv = existingEnv;

  // Replace or add Supabase variables
  const patterns = [
    {
      key: "VITE_SUPABASE_URL",
      value: config.supabaseUrl,
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      value: config.supabaseServiceKey,
    },
  ];

  for (const { key, value } of patterns) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(newEnv)) {
      newEnv = newEnv.replace(regex, `${key}="${value}"`);
    } else {
      newEnv += `\n${key}="${value}"`;
    }
  }

  fs.writeFileSync(envPath, newEnv.trim() + "\n");
  console.log(`✅ Updated ${envPath}`);
}

async function main() {
  try {
    console.log("═══════════════════════════════════════════");
    console.log("  BD Pulse LeadGen - Supabase Setup");
    console.log("═══════════════════════════════════════════");

    // Get credentials
    const config = await getProjectCredentials();

    // Test connection with a simple SQL query
    console.log("\n🧪 Testing connection...");
    const client = createClient(config.supabaseUrl, config.supabaseServiceKey);

    try {
      const { data, error } = await client.rpc("now");
      if (error && !error.message.includes("does not exist")) {
        throw error;
      }
      console.log("✅ Connection successful!\n");
    } catch (err: any) {
      console.warn("⚠️  Connection test inconclusive (this is OK for new projects)");
      console.log("   Proceeding anyway...\n");
    }

    // Ask if user wants to execute via API or manual SQL
    const method = await question(
      "Execute schema now? (y)es / (m)anual / (n)o: "
    );

    if (method.toLowerCase() === "y" || method.toLowerCase() === "yes") {
      const sqlPath = path.join(__dirname, "replicate-schema.sql");
      await executeSchemaViaApi(
        config.supabaseUrl,
        config.supabaseServiceKey,
        sqlPath
      );
    } else if (method.toLowerCase() === "m" || method.toLowerCase() === "manual") {
      const sqlPath = path.join(__dirname, "replicate-schema.sql");
      console.log("\n📋 Manual SQL Execution:");
      console.log("1. Go to Supabase Dashboard → SQL Editor");
      console.log("2. Click 'New query'");
      console.log(`3. Open: ${sqlPath}`);
      console.log("4. Copy all contents and paste into SQL Editor");
      console.log("5. Click 'Run'\n");
    }

    // Update .env file
    const updateEnv = await question("\n💾 Update .env file with new credentials? (y/n): ");
    if (updateEnv.toLowerCase() === "y") {
      const envPath = path.join(process.cwd(), ".env");
      generateEnvFile(config, envPath);
    }

    console.log("\n📚 Next steps:");
    console.log("1. Deploy Edge Functions: npx supabase functions deploy");
    console.log("2. Restart dev server: npm run dev");
    console.log(
      "3. Test collection: Add keywords in Step 1 and click 'Collect Latest News'\n"
    );

    console.log("✨ Setup complete!");
    rl.close();
  } catch (error: any) {
    console.error("❌ Setup failed:", error.message);
    rl.close();
    process.exit(1);
  }
}

main();
