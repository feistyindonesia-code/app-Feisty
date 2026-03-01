import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  ApiResponse,
  AuthError,
  ValidationError,
  validateRequiredFields,
  createErrorResponse,
  createSuccessResponse,
} from "../shared/utils.ts";

interface CreateOrderRequest {
  outlet_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_instructions?: string;
  items: Array<{
    product_id: string;
    quantity: number;
    notes?: string;
  }>;
  payment_method: string;
  referral_code?: string;
}

serve(async (req: Request) => {
  try {
    // CORS
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

    // Validate Authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify(createErrorResponse("Unauthorized", "AUTH_ERROR")),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const requestBody: CreateOrderRequest = await req.json();

    // Validate required fields
    validateRequiredFields(requestBody, [
      "outlet_id",
      "customer_name",
      "customer_phone",
      "delivery_address",
      "items",
      "payment_method",
    ]);

    if (!Array.isArray(requestBody.items) || requestBody.items.length === 0) {
      throw new ValidationError("Order must have at least one item", "EMPTY_ITEMS");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify outlet exists
    const { data: outlet, error: outletError } = await supabase
      .from("outlets")
      .select("*")
      .eq("id", requestBody.outlet_id)
      .single();

    if (outletError || !outlet) {
      throw new ValidationError("Outlet not found", "OUTLET_NOT_FOUND");
    }

    // Verify products exist and calculate totals
    const productIds = requestBody.items.map((item) => item.product_id);
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, price")
      .in("id", productIds);

    if (productsError || !products) {
      throw new ValidationError("Error fetching products", "PRODUCT_ERROR");
    }

    const productMap = new Map(products.map((p) => [p.id, p.price]));

    let subtotal = 0;
    for (const item of requestBody.items) {
      const price = productMap.get(item.product_id);
      if (!price) {
        throw new ValidationError(
          `Product ${item.product_id} not found`,
          "PRODUCT_NOT_FOUND"
        );
      }
      subtotal += price * item.quantity;
    }

    // Calculate delivery fee if coordinates provided
    let deliveryFee = 0;
    if (
      requestBody.delivery_latitude !== undefined &&
      requestBody.delivery_longitude !== undefined
    ) {
      const { data: zone, error: zoneError } = await supabase.rpc(
        "check_delivery_coverage",
        {
          p_outlet_id: requestBody.outlet_id,
          p_latitude: requestBody.delivery_latitude,
          p_longitude: requestBody.delivery_longitude,
        }
      );

      if (!zoneError && zone && zone[0]) {
        deliveryFee = zone[0].delivery_fee;
      }
    }

    const tax = subtotal * 0.1; // 10% tax
    const total = subtotal + deliveryFee + tax;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        organization_id: outlet.organization_id,
        outlet_id: requestBody.outlet_id,
        customer_name: requestBody.customer_name,
        customer_phone: requestBody.customer_phone,
        customer_email: requestBody.customer_email,
        delivery_address: requestBody.delivery_address,
        delivery_latitude: requestBody.delivery_latitude,
        delivery_longitude: requestBody.delivery_longitude,
        delivery_instructions: requestBody.delivery_instructions,
        subtotal,
        tax,
        delivery_fee: deliveryFee,
        total,
        status: "pending",
        source: "weborder",
      })
      .select("*")
      .single();

    if (orderError || !order) {
      throw new Error(`Order creation failed: ${orderError?.message}`);
    }

    // Insert order items
    const orderItems = requestBody.items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name:
        products.find((p) => p.id === item.product_id)?.name || "Unknown",
      product_price: productMap.get(item.product_id),
      quantity: item.quantity,
      notes: item.notes,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      // Rollback order
      await supabase.from("orders").delete().eq("id", order.id);
      throw new Error(`Order items creation failed: ${itemsError.message}`);
    }

    // Create payment record
    const { error: paymentError } = await supabase.from("payments").insert({
      order_id: order.id,
      organization_id: outlet.organization_id,
      amount: total,
      status: "pending",
      method: requestBody.payment_method,
    });

    if (paymentError) {
      throw new Error(`Payment record creation failed: ${paymentError.message}`);
    }

    return new Response(
      JSON.stringify(
        createSuccessResponse({
          order_id: order.id,
          order_number: order.order_number,
          total,
          status: "pending",
        })
      ),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code =
      error instanceof ValidationError ? error.code : "INTERNAL_ERROR";

    return new Response(JSON.stringify(createErrorResponse(message, code)), {
      status: error instanceof ValidationError ? 400 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
