import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
  validateRequiredFields,
} from "../shared/utils.ts";

interface NotifyCustomerRequest {
  order_id: string;
}

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify(createErrorResponse("Method not allowed")),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify(createErrorResponse("Unauthorized", "AUTH_ERROR")),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const requestBody: NotifyCustomerRequest = await req.json();

    validateRequiredFields(requestBody, ["order_id"]);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // fetch order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", requestBody.order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify(createErrorResponse("Order not found", "ORDER_NOT_FOUND")),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // build simple customer notification (could be email or whatsapp)
    const message = `Terima kasih ${order.customer_name}, pesanan Anda (${order.order_number}) telah diterima dan sedang diproses. Total: Rp ${order.total}`;

    // for now just record message in whatsapp_messages table
    await supabase.from("whatsapp_messages").insert({
      organization_id: order.organization_id,
      message_type: "notification",
      message_text: message,
      phone_number: order.customer_phone,
      direction: "outbound",
    });

    return new Response(
      JSON.stringify(
        createSuccessResponse({ order_id: order.id, message_sent: true })
      ),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify(createErrorResponse(message, "ERROR")),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});