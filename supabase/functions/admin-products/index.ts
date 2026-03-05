import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

interface Product {
  id?: string;
  name: string;
  description?: string;
  category_id?: string;
  price: number;
  image_url?: string;
  is_available?: boolean;
  is_global?: boolean;
  outlet_id?: string;
  emoji?: string;
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
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify(createErrorResponse("Unauthorized", "UNAUTHORIZED")),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify(createErrorResponse("Invalid token", "INVALID_TOKEN")),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get user role
    const { data: userData } = await supabase
      .from("user_accounts")
      .select("id, role, organization_id")
      .eq("id", user.id)
      .single();

    if (!userData || !["super_admin", "admin", "outlet_admin"].includes(userData.role)) {
      return new Response(
        JSON.stringify(createErrorResponse("Admin access required", "FORBIDDEN")),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Handle different methods
    if (req.method === "GET") {
      return await handleGet(supabase, userData);
    } else if (req.method === "POST") {
      return await handlePost(supabase, userData, req);
    } else if (req.method === "PUT") {
      return await handlePut(supabase, userData, req);
    } else if (req.method === "DELETE") {
      return await handleDelete(supabase, userData, req);
    }

    return new Response(
      JSON.stringify(createErrorResponse("Method not allowed", "METHOD_NOT_ALLOWED")),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify(createErrorResponse(message, "INTERNAL_ERROR")),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function handleGet(supabase: any, userData: any) {
  const url = new URL(req.url || "http://localhost");
  const categoryId = url.searchParams.get("category_id");
  const outletId = url.searchParams.get("outlet_id");

  let query = supabase
    .from("products")
    .select(`
      *,
      categories:product_categories(name, slug)
    `)
    .order("name");

  // Filter by organization
  if (userData.role !== "super_admin") {
    query = query.eq("organization_id", userData.organization_id);
  }

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (outletId) {
    // Get products for specific outlet (global or assigned)
    query = query.eq("outlet_id", outletId);
  }

  const { data, error } = await query;

  if (error) {
    return new Response(
      JSON.stringify(createErrorResponse(error.message, "FETCH_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify(createSuccessResponse(data)),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

async function handlePost(supabase: any, userData: any, req: Request) {
  const product: Product = await req.json();

  if (!product.name || !product.price) {
    return new Response(
      JSON.stringify(createErrorResponse("Name and price are required", "VALIDATION_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const insertData: any = {
    name: product.name,
    description: product.description || null,
    category_id: product.category_id || null,
    price: product.price,
    image_url: product.image_url || null,
    is_available: product.is_available !== false,
    is_global: product.is_global !== false, // Default to global
    outlet_id: product.outlet_id || null,
    emoji: product.emoji || null,
    organization_id: userData.organization_id,
  };

  const { data, error } = await supabase
    .from("products")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify(createErrorResponse(error.message, "INSERT_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify(createSuccessResponse(data)),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
}

async function handlePut(supabase: any, userData: any, req: Request) {
  const { searchParams } = new URL(req.url || "http://localhost");
  const productId = searchParams.get("id");

  if (!productId) {
    return new Response(
      JSON.stringify(createErrorResponse("Product ID required", "VALIDATION_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const product: Partial<Product> = await req.json();

  // Check ownership
  const { data: existing } = await supabase
    .from("products")
    .select("organization_id")
    .eq("id", productId)
    .single();

  if (!existing) {
    return new Response(
      JSON.stringify(createErrorResponse("Product not found", "NOT_FOUND")),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  if (userData.role !== "super_admin" && existing.organization_id !== userData.organization_id) {
    return new Response(
      JSON.stringify(createErrorResponse("Access denied", "FORBIDDEN")),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const updateData: any = {};
  if (product.name !== undefined) updateData.name = product.name;
  if (product.description !== undefined) updateData.description = product.description;
  if (product.category_id !== undefined) updateData.category_id = product.category_id;
  if (product.price !== undefined) updateData.price = product.price;
  if (product.image_url !== undefined) updateData.image_url = product.image_url;
  if (product.is_available !== undefined) updateData.is_available = product.is_available;
  if (product.is_global !== undefined) updateData.is_global = product.is_global;
  if (product.outlet_id !== undefined) updateData.outlet_id = product.outlet_id;
  if (product.emoji !== undefined) updateData.emoji = product.emoji;

  const { data, error } = await supabase
    .from("products")
    .update(updateData)
    .eq("id", productId)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify(createErrorResponse(error.message, "UPDATE_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify(createSuccessResponse(data)),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

async function handleDelete(supabase: any, userData: any, req: Request) {
  const { searchParams } = new URL(req.url || "http://localhost");
  const productId = searchParams.get("id");

  if (!productId) {
    return new Response(
      JSON.stringify(createErrorResponse("Product ID required", "VALIDATION_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check ownership
  const { data: existing } = await supabase
    .from("products")
    .select("organization_id")
    .eq("id", productId)
    .single();

  if (!existing) {
    return new Response(
      JSON.stringify(createErrorResponse("Product not found", "NOT_FOUND")),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  if (userData.role !== "super_admin" && existing.organization_id !== userData.organization_id) {
    return new Response(
      JSON.stringify(createErrorResponse("Access denied", "FORBIDDEN")),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);

  if (error) {
    return new Response(
      JSON.stringify(createErrorResponse(error.message, "DELETE_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify(createSuccessResponse({ message: "Product deleted" })),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

// Add missing req variable
var req: Request;
