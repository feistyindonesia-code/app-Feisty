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
  bundle_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  delivery_latitude: number;
  delivery_longitude: number;
  delivery_instructions?: string;
  payment_method: string;
  referral_code?: string;
}

// Order flow requirements:
// 1. Bundle-only, web ordering
// 2. Validate coordinates and coverage
// 3. Assign nearest active outlet if covered
// 4. Expand bundle into product items server-side
// 5. Track referral_code usage
// 6. Insert into area_requests if not covered


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
      "bundle_id",
      "customer_name",
      "customer_phone",
      "delivery_address",
      "delivery_latitude",
      "delivery_longitude",
      "payment_method",
    ]);

    // coordinates are required for delivery validation
    if (
      requestBody.delivery_latitude === undefined ||
      requestBody.delivery_longitude === undefined
    ) {
      throw new ValidationError(
        "Delivery coordinates required",
        "MISSING_COORDINATES"
      );
    }


    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up bundle
    const { data: bundle, error: bundleError } = await supabase
      .from("bundles")
      .select("*")
      .eq("id", requestBody.bundle_id)
      .eq("is_active", true)
      .single();

    if (bundleError || !bundle) {
      throw new ValidationError("Bundle not found", "BUNDLE_NOT_FOUND");
    }

    // fetch bundle items with product details
    const { data: bundleItems, error: bundleItemsError } = await supabase
      .from("bundle_items")
      .select("product_id, quantity")
      .eq("bundle_id", requestBody.bundle_id);

    if (bundleItemsError) {
      throw new Error("Error fetching bundle items");
    }

    if (!bundleItems || bundleItems.length === 0) {
      throw new ValidationError("Bundle has no items", "EMPTY_BUNDLE");
    }

    const productIds = bundleItems.map((bi) => bi.product_id);
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, price")
      .in("id", productIds);

    if (productsError || !products) {
      throw new ValidationError("Error fetching products", "PRODUCT_ERROR");
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Calculate subtotal from bundle price (use bundle.price) to prevent price
    // tampering; product prices are kept internally only.
    let subtotal = parseFloat(bundle.price);

    // Determine delivery zone & assign outlet
    let deliveryFee = 0;
    let assignedOutletId: string | null = null;

    const { data: zoneResult, error: zoneResultError } = await supabase.rpc(
      "find_zone_by_location",
      {
        p_latitude: requestBody.delivery_latitude,
        p_longitude: requestBody.delivery_longitude,
      }
    );

    if (zoneResultError) {
      console.error("Zone lookup error:", zoneResultError);
    }

    if (zoneResult && zoneResult[0]) {
      deliveryFee = zoneResult[0].delivery_fee;
      assignedOutletId = zoneResult[0].outlet_id;
    }

    // If no outlet assigned, register area request and respond politely
    if (!assignedOutletId) {
      await supabase.from("area_requests").insert({
        customer_name: requestBody.customer_name,
        customer_phone: requestBody.customer_phone,
        latitude: requestBody.delivery_latitude,
        longitude: requestBody.delivery_longitude,
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

    const tax = subtotal * 0.1; // 10% tax
    const total = subtotal + deliveryFee + tax;

    // Create order record
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        organization_id: bundle.organization_id,
        outlet_id: assignedOutletId,
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
        referral_code: requestBody.referral_code || null,
      })
      .select("*")
      .single();

    if (orderError || !order) {
      throw new Error(`Order creation failed: ${orderError?.message}`);
    }

    // Insert order items by expanding bundle
    const orderItems = bundleItems.map((bi) => {
      const prod = productMap.get(bi.product_id);
      return {
        order_id: order.id,
        product_id: bi.product_id,
        product_name: prod?.name || "Unknown",
        product_price: prod?.price,
        quantity: bi.quantity,
        notes: null,
      };
    });

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
      organization_id: bundle.organization_id,
      amount: total,
      status: "pending",
      method: requestBody.payment_method,
    });

    // Record referral redemption if code provided
    if (requestBody.referral_code) {
      // attempt to link to referral_codes table
      const { data: refCode } = await supabase
        .from("referral_codes")
        .select("id")
        .eq("code", requestBody.referral_code)
        .single();

      if (refCode && refCode.id) {
        await supabase.from("referral_redemptions").insert({
          code_id: refCode.id,
          order_id: order.id,
          created_at: new Date().toISOString(),
        });
      }
    }

    // trigger notifications
    try {
      await supabase.functions.invoke("notify-outlet", {
        body: JSON.stringify({ order_id: order.id, notification_type: "new_order" }),
      });
    } catch (e) {
      console.error("Failed to call notify-outlet", e);
    }
    try {
      await supabase.functions.invoke("notify-customer", {
        body: JSON.stringify({ order_id: order.id }),
      });
    } catch (e) {
      console.error("Failed to call notify-customer", e);
    }

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
