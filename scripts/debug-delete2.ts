import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function debug() {
  // Try with a very old date
  const { data: delData, error: delError } = await supabase
    .from("collected_articles")
    .delete()
    .gte("created_at", "1970-01-01");

  console.log("Delete all since 1970:", {
    rowsAffected: delData?.length,
    error: delError,
  });
}

debug();
