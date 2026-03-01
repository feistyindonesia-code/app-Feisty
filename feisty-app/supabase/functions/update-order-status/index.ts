import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  ApiResponse,
  ValidateRequiredFields,
  createErrorResponse,
  createSuccessResponse,
} from "../shared/utils.ts";

interface UpdateOrderStatusRequest {
  order_id: string;
  status: string;
  notes?: string;
}

const validStatuses = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "on_delivery",
  "delivered",
  "cancelled",
  "refunded",
];

serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "PATCH",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "PATCH") {
      return new Response(JSON.stringify(createErrorResponse("Method not allowed")), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify(createErrorResponse("Unauthorized", "AUTH_ERROR")),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const requestBody: UpdateOrderStatusRequest = await req.json();

    validateRequiredFields(requestBody, ["order_id", "status"]);

    if (!validStatuses.includes(requestBody.status)) {
      return new Response(
        JSON.stringify(
          createErrorResponse(
            `Invalid status. Valid statuses: ${validStatuses.join(", ")}`,
            "INVALID_STATUS"
          )
        ),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current order
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

    // Determine if this is final status
    const isFinal = ["delivered", "cancelled", "refunded"].includes(
      requestBody.status
    );
    const completedAt = isFinal ? new Date().toISOString() : null;

    // Update order
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        status: requestBody.status,
        notes: requestBody.notes || order.notes,
        completed_at: completedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestBody.order_id)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(`Update failed: ${updateError.message}`);
    }

    // Log to audit trail
    await supabase.from("audit_logs").insert({
      organization_id: order.organization_id,
      entity_type: "order",
      entity_id: order.id,
      action: "status_updated",
      changes: {
        from: order.status,
        to: requestBody.status,
        notes: requestBody.notes,
      },
    });

    return new Response(
      JSON.stringify(
        createSuccessResponse({
          order_id: updatedOrder.id,
          order_number: updatedOrder.order_number,
          status: updatedOrder.status,
          updated_at: updatedOrder.updated_at,
        })
      ),
      {
        status: 200,
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

function validateRequiredFields(
  data: Record<string, any>,
  fields: string[]
): void {
  const missing = fields.filter((f) => !data[f]);
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
}
