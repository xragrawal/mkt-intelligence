##To redeploy your functions on Supabase with the new Gemini API key, follow these steps:

supabase link --project-ref zdnzgaoeniznnopikndg

GEMINI_API_KEY=AIzaSyBOcOt4xXUVvvu1sfd1lu-KPQYY1DRHB1A

supabase secrets set GEMINI_API_KEY=AIzaSyBOcOt4xXUVvvu1sfd1lu-KPQYY1DRHB1A

supabase functions deploy score-articles deep-dive



##Switch to OpenAI (quick test):

##Set the provider and API key on Supabase:

##supabase secrets set LLM_PROVIDER=openai
##supabase secrets set OPENAI_API_KEY=<your_openai_key>
##supabase functions deploy score-articles deep-dive