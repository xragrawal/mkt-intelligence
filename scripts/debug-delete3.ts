import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function debug() {
  // Try with returning to see what gets deleted
  const { data: delData, error: delError, count } = await supabase
    .from("collected_articles")
    .delete()
    .gte("created_at", "1970-01-01")
    .select("id, title") as any;

  console.log("Deleted records:", {
    count: delData?.length,
    firstFew: delData?.slice(0, 3),
    error: delError,
  });

  // Check remaining
  const { count: remaining } = await supabase
    .from("collected_articles")
    .select("*", { count: "exact", head: true }) as any;
  
  console.log("\nRemaining records:", remaining);
}

debug();
