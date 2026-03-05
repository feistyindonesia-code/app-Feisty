import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

interface OrderItem {
  product_id: string;
  quantity: number;
  notes?: string;
}

interface CreateWebOrderRequest {
  items: OrderItem[];
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_latitude: number;
  delivery_longitude: number;
  delivery_instructions?: string;
  payment_method: string;
  referral_code?: string;
}

interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: {
    message: string;
    code: string;
  };
}

function createSuccessResponse(data: unknown): ApiResponse {
  return { success: true, data };
}

function createErrorResponse(message: string, code: string = "ERROR"): ApiResponse {
  return { success: false, error: { message, code } };
}

serve(async (req: Request) => {
  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify(createErrorResponse("Method not allowed", "METHOD_NOT_ALLOWED")),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: CreateWebOrderRequest = await req.json();

    // Validate required fields
    if (!body.items || body.items.length === 0) {
      return new Response(
        JSON.stringify(createErrorResponse("Items are required", "MISSING_ITEMS")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!body.customer_name || !body.customer_phone || !body.delivery_address) {
      return new Response(
        JSON.stringify(createErrorResponse("Customer name, phone, and address are required", "MISSING_CUSTOMER_INFO")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (body.delivery_latitude === undefined || body.delivery_longitude === undefined) {
      return new Response(
        JSON.stringify(createErrorResponse("Delivery coordinates are required", "MISSING_COORDINATES")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get product details for all items
    const productIds = body.items.map((item) => item.product_id);
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, price, organization_id")
      .in("id", productIds)
      .eq("is_available", true);

    if (productsError || !products) {
      return new Response(
        JSON.stringify(createErrorResponse("Failed to fetch products", "PRODUCT_ERROR")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate all products exist and are available
    const productMap = new Map(products.map((p) => [p.id, p]));
    for (const item of body.items) {
      if (!productMap.has(item.product_id)) {
        return new Response(
          JSON.stringify(createErrorResponse(`Product not found: ${item.product_id}`, "PRODUCT_NOT_FOUND")),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Use the first product's organization (assuming single-org deployment)
    const organizationId = products[0].organization_id;

    // Find zone and outlet by coordinates
    let deliveryFee = 0;
    let assignedOutletId: string | null = null;

    const { data: zoneResult, error: zoneError } = await supabase.rpc(
      "find_zone_by_location",
      {
        p_latitude: body.delivery_latitude,
        p_longitude: body.delivery_longitude,
      }
    );

    if (zoneError) {
      console.error("Zone lookup error:", zoneError);
    }

    if (zoneResult && zoneResult[0]) {
      deliveryFee = zoneResult[0].delivery_fee || 0;
      assignedOutletId = zoneResult[0].outlet_id;
    }

    // If no outlet assigned, create area request
    if (!assignedOutletId) {
      // Try to get any active outlet as fallback
      const { data: fallbackOutlet } = await supabase
        .from("outlets")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .single();

      if (fallbackOutlet) {
        assignedOutletId = fallbackOutlet.id;
      } else {
        // Register area request
        await supabase.from("area_requests").insert({
          customer_name: body.customer_name,
          customer_phone: body.customer_phone,
          latitude: body.delivery_latitude,
          longitude: body.delivery_longitude,
        });

        return new Response(
          JSON.stringify(
            createErrorResponse(
              "Lokasi Anda berada di luar zona layanan kami. Kami akan menghubungi Anda jika area sudah tercover.",
              "OUTAGE_AREA"
            )
          ),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Calculate totals
    let subtotal = 0;
    const orderItems = body.items.map((item) => {
      const product = productMap.get(item.product_id)!;
      const itemTotal = parseFloat(product.price) * item.quantity;
      subtotal += itemTotal;

      return {
        product_id: item.product_id,
        product_name: product.name,
        product_price: product.price,
        quantity: item.quantity,
        notes: item.notes || null,
      };
    });

    const tax = Math.round(subtotal * 0.1); // 10% tax
    const total = subtotal + deliveryFee + tax;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        organization_id: organizationId,
        outlet_id: assignedOutletId,
        customer_name: body.customer_name,
        customer_phone: body.customer_phone,
        delivery_address: body.delivery_address,
        delivery_latitude: body.delivery_latitude,
        delivery_longitude: body.delivery_longitude,
        delivery_instructions: body.delivery_instructions || null,
        subtotal,
        tax,
        delivery_fee: deliveryFee,
        total,
        status: "pending",
        source: "weborder",
        referral_code: body.referral_code || null,
      })
      .select("id, order_number")
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify(createErrorResponse(`Order creation failed: ${orderError?.message}`, "ORDER_ERROR")),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Insert order items with order_id
    const orderItemsWithOrderId = orderItems.map((item) => ({
      ...item,
      order_id: order.id,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItemsWithOrderId);

    if (itemsError) {
      // Rollback order
      await supabase.from("orders").delete().eq("id", order.id);
      return new Response(
        JSON.stringify(createErrorResponse(`Failed to add items: ${itemsError.message}`, "ITEMS_ERROR")),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create payment record
    const paymentMethod = body.payment_method === "qris" ? "e_wallet" : 
                          body.payment_method === "transfer" ? "bank_transfer" : "cash";

    await supabase.from("payments").insert({
      order_id: order.id,
      organization_id: organizationId,
      amount: total,
      status: "pending",
      method: paymentMethod,
    });

    // Trigger notifications (non-blocking)
    try {
      await supabase.functions.invoke("notify-outlet", {
        body: JSON.stringify({ order_id: order.id, notification_type: "new_order" }),
      });
    } catch (e) {
      console.error("Failed to notify outlet:", e);
    }

    try {
      await supabase.functions.invoke("notify-customer", {
        body: JSON.stringify({ order_id: order.id }),
      });
    } catch (e) {
      console.error("Failed to notify customer:", e);
    }

    return new Response(
      JSON.stringify(
        createSuccessResponse({
          order_id: order.id,
          order_number: order.order_number,
          subtotal,
          delivery_fee: deliveryFee,
          tax,
          total,
          status: "pending",
          message: "Pesanan berhasil dibuat! Kami akan menghubungi Anda melalui WhatsApp.",
        })
      ),
      {
        status: 201,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify(createErrorResponse(message, "INTERNAL_ERROR")),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
