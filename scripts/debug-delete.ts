import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function debug() {
  // First, get a few records to see what we're working with
  const { data: records, error } = await supabase
    .from("collected_articles")
    .select("id, title")
    .limit(2);

  console.log("Records in DB:", records);
  console.log("Error:", error);

  // Try deleting with a different approach
  const { data: delData, error: delError } = await supabase
    .from("collected_articles")
    .delete()
    .is("batch_id", null);

  console.log("Delete result data:", delData);
  console.log("Delete error:", delError);

  // Try without any filter at all
  const { data: delData2, error: delError2 } = await supabase
    .from("collected_articles")
    .delete();

  console.log("Delete all result data:", delData2);
  console.log("Delete all error:", delError2);
}

debug();
