import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
  validateRequiredFields,
} from "../shared/utils.ts";

interface CreatePaymentRequest {
  order_id: string;
  amount: number;
  method: string;
  reference_id?: string;
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

    const requestBody: CreatePaymentRequest = await req.json();

    validateRequiredFields(requestBody, [
      "order_id",
      "amount",
      "method",
    ]);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify order exists
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", requestBody.order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify(
          createErrorResponse("Order not found", "ORDER_NOT_FOUND")
        ),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify amount matches
    if (Math.abs(requestBody.amount - order.total) > 0.01) {
      return new Response(
        JSON.stringify(
          createErrorResponse(
            "Amount does not match order total",
            "AMOUNT_MISMATCH"
          )
        ),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get existing payment
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("*")
      .eq("order_id", requestBody.order_id)
      .single();

    let payment;
    if (existingPayment) {
      // Update existing payment
      const { data: updated, error: updateError } = await supabase
        .from("payments")
        .update({
          status: "paid",
          method: requestBody.method,
          reference_id: requestBody.reference_id,
          transaction_id: `TXN-${Date.now()}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPayment.id)
        .select("*")
        .single();

      if (updateError) {
        throw new Error(`Payment update failed: ${updateError.message}`);
      }
      payment = updated;
    } else {
      // Create new payment
      const { data: created, error: createError } = await supabase
        .from("payments")
        .insert({
          order_id: requestBody.order_id,
          organization_id: order.organization_id,
          amount: requestBody.amount,
          status: "paid",
          method: requestBody.method,
          reference_id: requestBody.reference_id,
          transaction_id: `TXN-${Date.now()}`,
        })
        .select("*")
        .single();

      if (createError) {
        throw new Error(`Payment creation failed: ${createError.message}`);
      }
      payment = created;
    }

    // Update order status to confirmed
    await supabase
      .from("orders")
      .update({
        status: "confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestBody.order_id);

    // Log transaction
    await supabase.from("audit_logs").insert({
      organization_id: order.organization_id,
      entity_type: "payment",
      entity_id: payment.id,
      action: "created",
      changes: {
        amount: requestBody.amount,
        method: requestBody.method,
        reference_id: requestBody.reference_id,
      },
    });

    return new Response(
      JSON.stringify(
        createSuccessResponse({
          payment_id: payment.id,
          order_id: payment.order_id,
          amount: payment.amount,
          status: payment.status,
          transaction_id: payment.transaction_id,
        })
      ),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(JSON.stringify(createErrorResponse(message, "ERROR")), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
