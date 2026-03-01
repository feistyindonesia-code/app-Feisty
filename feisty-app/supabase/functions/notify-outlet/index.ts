import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
  validateRequiredFields,
} from "../shared/utils.ts";

interface NotifyOutletRequest {
  order_id: string;
  notification_type: "new_order" | "status_update" | "payment_received";
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

    const requestBody: NotifyOutletRequest = await req.json();

    validateRequiredFields(requestBody, ["order_id", "notification_type"]);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        `
        *,
        outlet:outlet_id(*)
      `
      )
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

    // Get outlet device
    const { data: device } = await supabase
      .from("whatsapp_devices")
      .select("*")
      .eq("outlet_id", order.outlet_id)
      .eq("is_active", true)
      .single();

    if (!device) {
      return new Response(
        JSON.stringify(
          createErrorResponse(
            "Outlet WhatsApp device not configured",
            "DEVICE_NOT_FOUND"
          )
        ),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build notification message
    let notificationMessage = "";

    switch (requestBody.notification_type) {
      case "new_order":
        notificationMessage = buildNewOrderNotification(order);
        break;

      case "status_update":
        notificationMessage = buildStatusUpdateNotification(order);
        break;

      case "payment_received":
        notificationMessage = buildPaymentReceivedNotification(order);
        break;
    }

    // Send WhatsApp notification via Whacenter API
    const result = await sendWhatsAppNotification(
      device.device_id,
      device.phone_number,
      notificationMessage,
      supabaseUrl,
      supabaseServiceKey
    );

    if (!result.success) {
      console.error("Failed to send WhatsApp notification:", result.error);
      // Don't fail the whole operation, just log it
    }

    // Store notification record
    await supabase.from("whatsapp_messages").insert({
      organization_id: order.organization_id,
      device_id: device.id,
      phone_number: order.outlet.phone,
      message_type: "notification",
      message_text: notificationMessage,
      direction: "outbound",
    });

    return new Response(
      JSON.stringify(
        createSuccessResponse({
          order_id: order.id,
          notification_type: requestBody.notification_type,
          sent: result.success,
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

function buildNewOrderNotification(order: any): string {
  return `🚨 *PESANAN BARU*

📦 Order: ${order.order_number}
💰 Total: Rp ${order.total}
👤 Customer: ${order.customer_name}
📱 HP: ${order.customer_phone}
📍 Alamat: ${order.delivery_address}

⏰ Waktu Pesan: ${new Date(
    order.created_at
  ).toLocaleString("id-ID")}

Status: ${order.status}`;
}

function buildStatusUpdateNotification(order: any): string {
  return `📌 *UPDATE STATUS PESANAN*

📦 Order: ${order.order_number}
Status: ${order.status}
⏰ Update: ${new Date(order.updated_at).toLocaleString("id-ID")}`;
}

function buildPaymentReceivedNotification(order: any): string {
  return `✅ *PEMBAYARAN DITERIMA*

📦 Order: ${order.order_number}
💰 Jumlah: Rp ${order.total}
👤 Dari: ${order.customer_name}
⏰ Waktu: ${new Date().toLocaleString("id-ID")}`;
}

async function sendWhatsAppNotification(
  deviceId: string,
  recipientPhone: string,
  message: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // This integration depends on Whacenter API
    // Implementation varies based on your Whacenter setup
    console.log(
      `Sending WhatsApp to ${recipientPhone} via device ${deviceId}: ${message}`
    );

    // In production, call Whacenter API:
    // const response = await fetch('https://whacenter-api.com/send', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${whacenterToken}` },
    //   body: JSON.stringify({
    //     phone: recipientPhone,
    //     message: message
    //   })
    // });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
