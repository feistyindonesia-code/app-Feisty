import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

interface OutletUser {
  user_email: string;
  user_name?: string;
  outlet_id: string;
  role: string;
  can_edit_menu?: boolean;
  can_view_reports?: boolean;
  can_manage_orders?: boolean;
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
  const url = new URL(req?.url || "http://localhost");
  const outletId = url.searchParams.get("outlet_id");

  let query = supabase
    .from("outlet_users")
    .select(`
      id,
      user_id,
      outlet_id,
      role,
      can_edit_menu,
      can_view_reports,
      can_manage_orders,
      is_active,
      created_at,
      user_accounts!inner(
        id,
        email,
        full_name,
        phone,
        is_active
      )
    `);

  if (outletId) {
    query = query.eq("outlet_id", outletId);
  }

  if (userData.role !== "super_admin") {
    query = query.eq("organization_id", userData.organization_id);
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
  const input: OutletUser = await req.json();

  if (!input.user_email || !input.outlet_id || !input.role) {
    return new Response(
      JSON.stringify(createErrorResponse("Email, outlet_id, and role are required", "VALIDATION_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Find or create user
  let userId: string;
  const { data: existingUser } = await supabase
    .from("user_accounts")
    .select("id")
    .eq("email", input.user_email.toLowerCase())
    .single();

  if (existingUser) {
    userId = existingUser.id;
  } else {
    // Create new user account
    const { data: newUser, error: createError } = await supabase
      .from("user_accounts")
      .insert({
        email: input.user_email.toLowerCase(),
        full_name: input.user_name || input.user_email.split("@")[0],
        role: "kasir",
        organization_id: userData.organization_id,
        is_active: true,
        is_verified: false,
      })
      .select("id")
      .single();

    if (createError || !newUser) {
      return new Response(
        JSON.stringify(createErrorResponse(createError?.message || "Failed to create user", "CREATE_USER_ERROR")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    userId = newUser.id;
  }

  // Check if already assigned to outlet
  const { data: existing } = await supabase
    .from("outlet_users")
    .select("id")
    .eq("user_id", userId)
    .eq("outlet_id", input.outlet_id)
    .single();

  if (existing) {
    return new Response(
      JSON.stringify(createErrorResponse("User already assigned to this outlet", "ALREADY_ASSIGNED")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Assign user to outlet
  const { data, error } = await supabase
    .from("outlet_users")
    .insert({
      user_id: userId,
      outlet_id: input.outlet_id,
      role: input.role,
      can_edit_menu: input.can_edit_menu || false,
      can_view_reports: input.can_view_reports || false,
      can_manage_orders: input.can_manage_orders !== false,
      is_active: true,
    })
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
  const { searchParams } = new URL(req?.url || "http://localhost");
  const assignmentId = searchParams.get("id");

  if (!assignmentId) {
    return new Response(
      JSON.stringify(createErrorResponse("Assignment ID required", "VALIDATION_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const input = await req.json();

  const updateData: any = {};
  if (input.role !== undefined) updateData.role = input.role;
  if (input.can_edit_menu !== undefined) updateData.can_edit_menu = input.can_edit_menu;
  if (input.can_view_reports !== undefined) updateData.can_view_reports = input.can_view_reports;
  if (input.can_manage_orders !== undefined) updateData.can_manage_orders = input.can_manage_orders;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  const { data, error } = await supabase
    .from("outlet_users")
    .update(updateData)
    .eq("id", assignmentId)
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
  const { searchParams } = new URL(req?.url || "http://localhost");
  const assignmentId = searchParams.get("id");

  if (!assignmentId) {
    return new Response(
      JSON.stringify(createErrorResponse("Assignment ID required", "VALIDATION_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { error } = await supabase
    .from("outlet_users")
    .delete()
    .eq("id", assignmentId);

  if (error) {
    return new Response(
      JSON.stringify(createErrorResponse(error.message, "DELETE_ERROR")),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify(createSuccessResponse({ message: "User removed from outlet" })),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

var req: Request;
