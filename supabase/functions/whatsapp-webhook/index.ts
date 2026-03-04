import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
  validateWebhookSignature,
} from "../shared/utils.ts";

interface WhatsAppWebhookPayload {
  entry: Array<{
    changes: Array<{
      value: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
          image?: { id: string };
        }>;
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: number;
        }>;
      };
    }>;
  }>;
}

serve(async (req: Request) => {
  try {
    // Handle webhook verification
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const challenge = url.searchParams.get("hub.challenge");
      const verify_token = url.searchParams.get("hub.verify_token");

      const expectedToken = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") || "";

      if (mode === "subscribe" && verify_token === expectedToken) {
        return new Response(challenge, { status: 200 });
      }

      return new Response("Forbidden", { status: 403 });
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

    // Verify webhook signature
    const signature = req.headers.get("x-hub-signature") || "";
    const webhookSecret = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") || "";

    const body = await req.text();

    // Validate signature
    if (!validateWebhookSignature(body, signature, webhookSecret)) {
      return new Response(
        JSON.stringify(
          createErrorResponse("Invalid signature", "SIGNATURE_ERROR")
        ),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload: WhatsAppWebhookPayload = JSON.parse(body);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Process messages
    if (payload.entry && payload.entry[0]) {
      const changes = payload.entry[0].changes;

      if (changes && changes[0]) {
        const value = changes[0].value;

        // Process incoming messages
        if (value.messages) {
          for (const msg of value.messages) {
            await handleIncomingMessage(
              msg,
              supabase,
              supabaseUrl,
              supabaseServiceKey
            );
          }
        }

        // Process status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await handleStatusUpdate(status, supabase);
          }
        }
      }
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

async function handleIncomingMessage(
  message: any,
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<void> {
  try {
    // Store message in database
    const { data: stored, error: storeError } = await supabase
      .from("whatsapp_messages")
      .insert({
        phone_number: message.from,
        message_type: message.type,
        message_text: message.text?.body,
        message_data: message,
        direction: "inbound",
        webhook_id: message.id,
      })
      .select("*")
      .single();

    if (storeError) {
      console.error("Error storing message:", storeError);
      return;
    }

    // Call AI dispatcher for processing (gateway behaviour only)
    try {
      await fetch(`${supabaseUrl}/functions/v1/ai-dispatcher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          message: message.text?.body || "",
          phone_number: message.from,
          device_id: stored.id,
          organization_id: stored.organization_id,
        }),
      });
    } catch (e) {
      console.error("Failed to invoke ai-dispatcher:", e);
    }
  } catch (error) {
    console.error("Error handling incoming message:", error);
  }
}

async function handleStatusUpdate(
  status: any,
  supabase: any
): Promise<void> {
  try {
    const { error } = await supabase
      .from("whatsapp_messages")
      .update({
        message_data: { status: status.status },
        is_processed: true,
      })
      .eq("webhook_id", status.id);

    if (error) {
      console.error("Error updating status:", error);
    }
  } catch (error) {
    console.error("Error handling status update:", error);
  }
}
