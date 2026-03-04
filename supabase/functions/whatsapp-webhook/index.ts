import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../shared/utils.ts";

interface WhacenterPayload {
  from: string;
  message: string;
}

serve(async (req: Request) => {
  try {
    // Handle GET request (webhook verification)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const challenge = url.searchParams.get("hub.challenge");
      const verify_token = url.searchParams.get("hub.verify_token");

      // Optional verification if token is configured
      const expectedToken = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") || "";
      
      if (expectedToken && verify_token !== expectedToken) {
        return new Response("Forbidden", { status: 403 });
      }

      // Return challenge for verification
      return new Response(challenge || "OK", { status: 200 });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify(createErrorResponse("Method not allowed")),
        {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Parse Whacenter payload - simple format
    // { "from": "6281234567890", "message": "Halo" }
    const payload: WhacenterPayload = await req.json();

    // Validate required fields
    if (!payload.from || !payload.message) {
      return new Response(
        JSON.stringify(createErrorResponse("Missing required fields: from and message", "INVALID_PAYLOAD")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get default organization
    let organizationId: string | null = null;
    try {
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .single();
      
      if (org && !orgError) {
        organizationId = org.id;
        console.log("Found organization:", organizationId);
      } else {
        console.log("No organization found or error:", orgError);
      }
    } catch (e) {
      console.error("Error getting organization:", e);
    }

    console.log("Using organization_id:", organizationId);

    // Extract referral code from message if present
    let referredByCode: string | undefined;
    const messageText = payload.message;
    
    // Try to extract referral code from message
    // Format: "kode XXXXX" or "referral XXXXX"
    const codeMatch = messageText.match(/kode\s+(?:referral\s+)?[:\s]+([A-Z0-9]{4,10})/i) ||
                      messageText.match(/(?:referral|kode)\s+([A-Z0-9]{4,10})/i);
    if (codeMatch) {
      referredByCode = codeMatch[1].toUpperCase();
      console.log("Referral code detected:", referredByCode);
    }

    // Store incoming message in database (organization_id optional)
    // Get device_id - try to find from whatsapp_devices or use default
    let deviceId: string | null = null;
    try {
      const { data: device } = await supabase
        .from("whatsapp_devices")
        .select("id")
        .limit(1)
        .single();
      
      if (device) {
        deviceId = device.id;
      }
    } catch (e) {
      console.log("No whatsapp device found, will skip device_id");
    }

    const insertData: any = {
      phone_number: payload.from,
      message_type: "text",
      message_text: messageText,
      direction: "inbound",
    };

    // Add device_id if found
    if (deviceId) {
      insertData.device_id = deviceId;
    }

    // Only add organization_id if we have it
    if (organizationId) {
      insertData.organization_id = organizationId;
    }

    const { data: stored, error: storeError } = await supabase
      .from("whatsapp_messages")
      .insert(insertData)
      .select("*")
      .single();

    if (storeError) {
      console.error("Error storing message:", storeError);
    }

    // Check if customer exists and update referral if needed
    if (referredByCode) {
      const { data: existingCustomer } = await supabase
        .from("whatsapp_customers")
        .select("id, referrer_code")
        .eq("phone_number", payload.from)
        .single();

      if (existingCustomer && !existingCustomer.referrer_code) {
        // Update referrer for existing customer
        await supabase
          .from("whatsapp_customers")
          .update({
            referrer_code: referredByCode,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingCustomer.id);

        // Find referrer and increment their referral count
        const { data: referrer } = await supabase
          .from("whatsapp_customers")
          .select("id, total_referrals")
          .eq("my_referral_code", referredByCode)
          .single();

        if (referrer) {
          await supabase
            .from("whatsapp_customers")
            .update({
              total_referrals: (referrer.total_referrals || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq("id", referrer.id);
        }
      }
    }

    // Call AI dispatcher for processing
    try {
      // Use Supabase client invoke instead of raw fetch
      const { data, error } = await supabase.functions.invoke('ai-dispatcher', {
        body: {
          message: messageText,
          phone_number: payload.from,
          device_id: stored?.id,
          organization_id: stored?.organization_id,
          referred_by_code: referredByCode,
        }
      });

      if (error) {
        console.error('AI Dispatcher error:', error);
      } else {
        console.log('AI Dispatcher response:', data);
      }
    } catch (e) {
      console.error('Failed to invoke ai-dispatcher:', e);
    }

    return new Response(
      JSON.stringify(
        createSuccessResponse({ message: "Webhook processed" })
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook error:", message);

    return new Response(
      JSON.stringify(createErrorResponse(message, "WEBHOOK_ERROR")),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
