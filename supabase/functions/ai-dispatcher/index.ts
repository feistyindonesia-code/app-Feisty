import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../shared/utils.ts";

interface AIDispatcherRequest {
  message: string;
  phone_number: string;
  device_id: string;
  organization_id: string;
}

interface AIIntent {
  type:
    | "menu_inquiry"
    | "order_status"
    | "create_order"
    | "complaint"
    | "support"
    | "unknown";
  confidence: number;
  parameters: Record<string, any>;
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
        {
          status: 405,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const requestBody: AIDispatcherRequest = await req.json();

    if (
      !requestBody.message ||
      !requestBody.phone_number ||
      !requestBody.device_id
    ) {
      return new Response(
        JSON.stringify(
          createErrorResponse("Missing required fields", "MISSING_FIELDS")
        ),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Store incoming message
    const { data: message, error: messageError } = await supabase
      .from("whatsapp_messages")
      .insert({
        organization_id: requestBody.organization_id,
        device_id: requestBody.device_id,
        phone_number: requestBody.phone_number,
        message_type: "text",
        message_text: requestBody.message,
        direction: "inbound",
      })
      .select("*")
      .single();

    if (messageError) {
      console.error("Error storing message:", messageError);
    }

    // Classify intent using OpenAI
    const intent = await classifyIntent(
      requestBody.message,
      openaiKey
    );

    // Route to appropriate handler
    let response: string = "";

    switch (intent.type) {
      case "order_status":
        response = await handleOrderStatus(
          requestBody.phone_number,
          supabaseUrl,
          supabaseServiceKey
        );
        break;

      case "menu_inquiry":
        response = await handleMenuInquiry(
          requestBody.organization_id,
          supabaseUrl,
          supabaseServiceKey
        );
        break;

      case "create_order":
        response =
          "Terima kasih! Untuk membuat pesanan, silakan kunjungi: https://feisty.app/weborder";
        break;

      case "complaint":
        response =
          "Terima kasih atas masukan Anda. Tim support kami siap membantu. Silakan deskripsikan masalahnya.";
        break;

      default:
        response =
          "Halo! Ada yang bisa kami bantu? Silakan pilih:\n1. Status pesanan\n2. Lihat menu\n3. Buat pesanan baru";
    }

    // Store outgoing message
    await supabase.from("whatsapp_messages").insert({
      organization_id: requestBody.organization_id,
      device_id: requestBody.device_id,
      phone_number: requestBody.phone_number,
      message_type: "text",
      message_text: response,
      direction: "outbound",
    });

    return new Response(
      JSON.stringify(
        createSuccessResponse({
          response,
          intent: intent.type,
          confidence: intent.confidence,
        })
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify(createErrorResponse(message, "ERROR")),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

async function classifyIntent(
  message: string,
  openaiKey: string
): Promise<AIIntent> {
  try {
    // For production, call OpenAI API with structured outputs
    // This is a simplified version
    const keywords = {
      status: ["pesanan", "order", "status", "dimana"],
      menu: ["menu", "produk", "harga", "apa saja"],
      order: ["pesan", "beli", "order", "mau"],
      complaint: ["komplain", "masalah", "error", "tidak"],
    };

    const lowerMessage = message.toLowerCase();

    if (
      keywords.status.some((k) => lowerMessage.includes(k))
    ) {
      return {
        type: "order_status",
        confidence: 0.8,
        parameters: {},
      };
    }

    if (
      keywords.menu.some((k) => lowerMessage.includes(k))
    ) {
      return {
        type: "menu_inquiry",
        confidence: 0.85,
        parameters: {},
      };
    }

    if (
      keywords.order.some((k) => lowerMessage.includes(k))
    ) {
      return {
        type: "create_order",
        confidence: 0.75,
        parameters: {},
      };
    }

    if (
      keywords.complaint.some((k) => lowerMessage.includes(k))
    ) {
      return {
        type: "complaint",
        confidence: 0.7,
        parameters: {},
      };
    }

    return {
      type: "unknown",
      confidence: 0.5,
      parameters: {},
    };
  } catch (error) {
    console.error("Classification error:", error);
    return {
      type: "unknown",
      confidence: 0.0,
      parameters: {},
    };
  }
}

async function handleOrderStatus(
  phoneNumber: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<string> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_phone", phoneNumber)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error || !orders || orders.length === 0) {
      return "Maaf, kami tidak menemukan pesanan dengan nomor telepon ini.";
    }

    let response = "Pesanan Anda:\n\n";
    orders.forEach((order, index) => {
      response += `${index + 1}. ${order.order_number} - Rp ${order
        .total} (Status: ${order.status})\n`;
    });

    return response;
  } catch (error) {
    console.error("Order status error:", error);
    return"Maaf, terjadi kesalahan. Silakan coba lagi nanti.";
  }
}

async function handleMenuInquiry(
  organizationId: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<string> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // only expose bundles to public/whatsapp
    const { data: bundles } = await supabase
      .from("bundles")
      .select("id, name, price")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    if (!bundles || bundles.length === 0) {
      return "Menu sedang tidak tersedia. Silakan coba lagi nanti.";
    }

    let response = "📦 PAKET KAMI:\n\n";
    bundles.forEach((b, index) => {
      response += `${index + 1}. ${b.name} - Rp ${b.price}\n`;
    });

    response +=
      "\n\nUntuk melihat detail dan memesan, kunjungi:\nhttps://feisty.app/weborder";

    return response;
  } catch (error) {
    console.error("Menu inquiry error:", error);
    return "Maaf, terjadi kesalahan. Silakan coba lagi nanti.";
  }
}
