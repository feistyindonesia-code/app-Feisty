import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";

interface LoginRequest {
  email: string;
  password?: string;
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
    // CORS
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

    const body: LoginRequest = await req.json();
    const { email } = body;

    if (!email) {
      return new Response(
        JSON.stringify(createErrorResponse("Email is required", "MISSING_EMAIL")),
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

    // Find user by email
    const { data: user, error: userError } = await supabase
      .from("user_accounts")
      .select(`
        id,
        email,
        full_name,
        phone,
        role,
        organization_id,
        outlet_id,
        is_active,
        organizations (
          id,
          name,
          slug
        ),
        outlets (
          id,
          name,
          slug,
          address
        )
      `)
      .eq("email", email.toLowerCase())
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify(createErrorResponse("User not found or inactive", "USER_NOT_FOUND")),
        { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Check if user is active (allow login even if role is null for now)
    if (user.is_active === false) {
      return new Response(
        JSON.stringify(createErrorResponse("User account is inactive", "USER_INACTIVE")),
        { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Get user's outlet assignments
    const { data: outletAssignments } = await supabase
      .from("outlet_users")
      .select(`
        id,
        outlet_id,
        role,
        can_edit_menu,
        can_view_reports,
        can_manage_orders,
        is_active,
        outlets (
          id,
          name,
          slug,
          address,
          phone,
          is_active,
          is_open
        )
      `)
      .eq("user_id", user.id)
      .eq("is_active", true);

    // Build response
    const responseData = {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        organization_id: user.organization_id,
        organization: user.organizations,
      },
      primary_outlet: user.outlets,
      assigned_outlets: outletAssignments?.map((oa: any) => ({
        id: oa.outlets.id,
        name: oa.outlets.name,
        slug: oa.outlets.slug,
        address: oa.outlets.address,
        phone: oa.outlets.phone,
        is_active: oa.outlets.is_active,
        is_open: oa.outlets.is_open,
        role: oa.role,
        permissions: {
          can_edit_menu: oa.can_edit_menu,
          can_view_reports: oa.can_view_reports,
          can_manage_orders: oa.can_manage_orders,
        },
      })) || [],
    };

    return new Response(
      JSON.stringify(createSuccessResponse(responseData)),
      {
        status: 200,
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
