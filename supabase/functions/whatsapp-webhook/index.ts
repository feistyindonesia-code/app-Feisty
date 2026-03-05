import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../shared/utils.ts";

// ============================================
// Gemini AI Integration
// ============================================

async function callGemini(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("GOOGLE_AI_API_KEY") || "";
  if (!apiKey) {
    console.error("Google AI API key not configured");
    return "Maaf, AI belum dikonfigurasi. Coba hubungi admin!";
  }

  console.log("Gemini request prompt:", prompt);

  const systemPrompt = `Kamu adalah AI assistant untuk Feisty Go International - bisnis food & beverage.

Tugas kamu:
1. Responsif, friendly, dan membantu
2. Jika customer bertanya tentang menu/paket, arahkan ke feisty.app/weborder
3. Jika customer mau pesan, arahkan ke feisty.app/weborder
4. Jika customer bertanya tentang referral, jelaskan manfaat berbagi link referral
5. Jika customer komplain, sikap baik dan arahkan ke customer service
6. Selalu gunakan emoji yang sesuai
7. Respons dalam Bahasa Indonesia yang natural

Info penting:
- Nama bisnis: Feisty Go International  
- Menu: Bisa lihat di feisty.app/weborder
- Contact: WhatsApp ini

Jawab dengan singkat, max 2 kalimat, kecuali jika customer meminta detail.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 120,
            topP: 0.9
          }
        }),
      }
    );

    console.log("Gemini response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API error:", JSON.stringify(errorData));
      return "Maaf, AI sedang mengalami gangguan. Silakan coba lagi nanti 🙏";
    }

    const data = await response.json();
    console.log("Gemini response data:", JSON.stringify(data).slice(0, 500));
    
    if (
      data.candidates &&
      data.candidates[0]?.content?.parts &&
      data.candidates[0].content.parts.length > 0 &&
      data.candidates[0].content.parts[0]?.text
    ) {
      return data.candidates[0].content.parts[0].text;
    }
    
    console.error("Gemini response format unexpected:", data);
    return "Maaf, AI sedang mengalami gangguan. Silakan coba lagi nanti 🙏";
  } catch (e) {
    console.error("Gemini error:", e);
    return "Maaf, AI sedang mengalami gangguan. Silakan coba lagi nanti 🙏";
  }
}

// ============================================
// Whacenter API
// ============================================

async function sendWhacenterMessage(deviceId: string, phone: string, messageText: string): Promise<any> {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
  if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
  
  console.log("Sending to Whacenter - device:", deviceId, "phone:", cleaned);

  try {
    const resp = await fetch('https://api.whacenter.com/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, number: cleaned, message: messageText }),
    });
    const result = await resp.json();
    console.log("Whacenter response:", JSON.stringify(result));
    return result;
  } catch (e) {
    console.error('Whacenter error:', e);
    return { success: false, error: String(e) };
  }
}

// ============================================
// Helper Functions
// ============================================

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  return cleaned;
}

async function getDeviceId(supabase: any): Promise<string | null> {
  try {
    const { data: devices, error } = await supabase
      .from("whatsapp_devices")
      .select("id")
      .eq("is_active", true)
      .limit(1);
    
    if (error) {
      console.log("Device query error:", error.message);
      return null;
    }
    
    if (!devices || devices.length === 0) {
      console.log("No device found - no active devices in database");
      return null;
    }
    
    return devices[0]?.id || null;
  } catch (e) {
    console.log("Error getting device:", e);
    return null;
  }
}

async function getOrganizationId(supabase: any): Promise<string | null> {
  try {
    const { data: orgs, error } = await supabase
      .from("organizations")
      .select("id")
      .eq("is_active", true)
      .limit(1);
    
    if (error) {
      console.log("Organization query error:", error.message);
      return null;
    }
    
    if (!orgs || orgs.length === 0) {
      console.log("No organization found - no active organizations in database");
      return null;
    }
    
    return orgs[0]?.id || null;
  } catch (e) {
    console.log("Error getting organization:", e);
    return null;
  }
}

async function getOrCreateCustomer(
  supabase: any, 
  phoneNumber: string, 
  referredByCode?: string
): Promise<any> {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  
  // Check if customer exists
  const { data: existing } = await supabase
    .from("whatsapp_customers")
    .select("*")
    .eq("phone_number", normalizedPhone)
    .single();

  if (existing) {
    console.log("Customer found:", existing.id);
    return existing;
  }

  console.log("Creating new customer for phone:", normalizedPhone);

  // Find referrer if code provided
  let referrerId = null;
  if (referredByCode) {
    const { data: referrer } = await supabase
      .from("whatsapp_customers")
      .select("id")
      .eq("my_referral_code", referredByCode.toUpperCase())
      .single();
    
    if (referrer) {
      referrerId = referrer.id;
      console.log("Referrer found:", referrerId);
    }
  }

  // Get organization
  const organizationId = await getOrganizationId(supabase);

  // Generate unique referral code
  const myReferralCode = generateReferralCode();

  // Create new customer
  const { data: newCustomer, error } = await supabase
    .from("whatsapp_customers")
    .insert({
      phone_number: normalizedPhone,
      referrer_code: referredByCode?.toUpperCase(),
      referrer_id: referrerId,
      organization_id: organizationId,
      my_referral_code: myReferralCode,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating customer:", error);
    throw error;
  }

  console.log("New customer created:", newCustomer.id, "referral code:", myReferralCode);
  return newCustomer;
}

// ============================================
// Main Handler
// ============================================

interface WhacenterPayload {
  from?: string;
  message?: string;
  to?: string;
  pushName?: string;
  [key: string]: any;
}

serve(async (req: Request) => {
  try {
    // Handle GET request (webhook verification)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const challenge = url.searchParams.get("hub.challenge");
      return new Response(challenge || "OK", { status: 200 });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify(createErrorResponse("Method not allowed")),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse Whacenter payload
    const rawBody = await req.text();
    console.log("Raw webhook payload:", rawBody);
    
    let payload: WhacenterPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error("Failed to parse JSON:", e);
      return new Response(
        JSON.stringify(createErrorResponse("Invalid JSON", "PARSE_ERROR")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    if (!payload.from || !payload.message) {
      console.error("Missing required fields - from:", payload.from, "message:", payload.message);
      return new Response(
        JSON.stringify(createErrorResponse("Missing required fields: from and message", "INVALID_PAYLOAD")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("Valid payload - from:", payload.from, "message:", payload.message);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get device ID
    const deviceId = await getDeviceId(supabase);
    console.log("Using device ID:", deviceId);

    // Get organization ID
    const organizationId = await getOrganizationId(supabase);
    console.log("Using organization ID:", organizationId);

    // Extract referral code from message
    let referredByCode: string | undefined;
    const messageText = payload.message;
    const codeMatch = messageText.match(/kode\s+(?:referral\s+)?[:\s]+([A-Z0-9]{4,10})/i) ||
                      messageText.match(/(?:referral|kode)\s+([A-Z0-9]{4,10})/i);
    if (codeMatch) {
      referredByCode = codeMatch[1].toUpperCase();
      console.log("Referral code detected:", referredByCode);
    }

    // Store incoming message
    const normalizedFrom = normalizePhoneNumber(payload.from);
    
    const { data: inboundMsg, error: inboundError } = await supabase
      .from("whatsapp_messages")
      .insert({
        phone_number: normalizedFrom,
        message_type: "text",
        message_text: messageText,
        direction: "inbound",
        device_id: deviceId,
        organization_id: organizationId,
      })
      .select("*")
      .single();

    if (inboundError) {
      console.error("Error storing inbound message:", inboundError);
    } else {
      console.log("Inbound message stored:", inboundMsg?.id);
    }

    // Get or create customer
    let customer = await getOrCreateCustomer(supabase, payload.from, referredByCode);

    // Extract name if shared
    const nameMatch = messageText.match(/nama(?:ku|saya)?\s+([A-Za-z]{2,50})/i);
    if (nameMatch && customer.full_name !== nameMatch[1]) {
      await supabase
        .from("whatsapp_customers")
        .update({ full_name: nameMatch[1] })
        .eq("id", customer.id);
      console.log("Updated customer name to:", nameMatch[1]);
    }

    // Generate AI response
    const responseText = await callGemini(messageText);
    console.log("AI Response:", responseText);

    // Store outbound message
    const { data: outboundMsg, error: outboundError } = await supabase
      .from("whatsapp_messages")
      .insert({
        phone_number: normalizedFrom,
        message_type: "text",
        message_text: responseText,
        direction: "outbound",
        device_id: deviceId,
        organization_id: organizationId,
      })
      .select("*")
      .single();

    if (outboundError) {
      console.error("Error storing outbound message:", outboundError);
    } else {
      console.log("Outbound message stored:", outboundMsg?.id);
    }

    // Send response via Whacenter
    const whacenterDeviceId = Deno.env.get("WHACENTER_DEVICE_ID") || "";
    console.log("WHACENTER_DEVICE_ID configured:", !!whacenterDeviceId);
    
    if (whacenterDeviceId && deviceId) {
      const result = await sendWhacenterMessage(whacenterDeviceId, normalizedFrom, responseText);
      console.log("Whacenter send result:", JSON.stringify(result));
    } else {
      console.log("Whacenter not configured or no device, skipping send");
    }

    return new Response(
      JSON.stringify(createSuccessResponse({ 
        message: "Webhook processed",
        customer_id: customer.id,
        response_sent: !!whacenterDeviceId
      })),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook error:", message);

    return new Response(
      JSON.stringify(createErrorResponse(message, "WEBHOOK_ERROR")),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
