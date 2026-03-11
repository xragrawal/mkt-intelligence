To redeploy your functions on Supabase with the new Gemini API key, follow these steps:

Update your local .env file with the new Gemini API key:

GEMINI_API_KEY=<your_new_key>
Link to your Supabase project (if not already linked):

supabase link --project-ref zdnzgaoeniznnopikndg
Set the secret on Supabase so the functions pick it up:

supabase secrets set GEMINI_API_KEY=<your_new_key>
Deploy the functions that use Gemini (score-articles and deep-dive):

supabase functions deploy score-articles deep-dive
Verify deployment by checking the function logs in Supabase dashboard or running:

supabase functions list
Then truncate your tables to clear old data before the fresh test:

