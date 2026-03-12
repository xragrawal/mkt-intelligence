import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const HUNTER_API_KEY = Deno.env.get("HUNTER_API_KEY");
    if (!HUNTER_API_KEY) {
      throw new Error("HUNTER_API_KEY is not configured");
    }

    const res = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${HUNTER_API_KEY}`
    );
    
    if (!res.ok) {
      throw new Error(`Hunter API returned status: ${res.status}`);
    }

    const data = await res.json();
    const status = data?.data?.status; // valid, accept_all, invalid, etc.
    const isVerified = status === "valid" || status === "accept_all";

    return new Response(
      JSON.stringify({ verified: isVerified, status }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("verify-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
