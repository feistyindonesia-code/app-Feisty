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
    return "Maaf, AI belum dikonfigurasi. Coba hubungi admin!";
  }

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

Jawab dengan singkat, max 2 kalimat, kecuali jika customer meminta detail.}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 256,
          },
        }),
      }
    );

    const data = await response.json();
    console.log("Gemini response status:", response.status);
    console.log("Gemini response data:", JSON.stringify(data));
    
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    }
    return "Maaf, ada masalah dengan AI. Coba lagi ya!";
  } catch (e) {
    console.error("Gemini error:", e);
    return "Maaf, AI sedang sibuk. Coba lagi nanti!";
  }
}

// ============================================
// Whacenter API
// ============================================
async function sendWhacenterMessage(deviceId: string, phone: string, messageText: string): Promise<any> {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
  if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;
  
  console.log("Formatted phone for Whacenter:", cleaned);
  console.log("deviceId:", deviceId);

  try {
    const resp = await fetch('https://api.whacenter.com/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, number: cleaned, message: messageText }),
    });
    return await resp.json();
  } catch (e) {
    console.error('Whacenter error:', e);
    return { success: false, error: String(e) };
  }
}

async function getOrCreateCustomer(supabase: any, phoneNumber: string, referredByCode?: string): Promise<any> {
  const { data: existing } = await supabase
    .from("whatsapp_customers")
    .select("*")
    .eq("phone_number", phoneNumber)
    .single();

  if (existing) return existing;

  let referrerId = null;
  if (referredByCode) {
    const { data: referrer } = await supabase
      .from("whatsapp_customers")
      .select("id")
      .eq("my_referral_code", referredByCode)
      .single();
    if (referrer) referrerId = referrer.id;
  }

  // Get default organization
  let orgId = null;
  try {
    const { data: org } = await supabase.from("organizations").select("id").eq("is_active", true).limit(1).single();
    if (org) orgId = org.id;
  } catch (e) { console.log("No org found"); }

  const { data: newCustomer, error } = await supabase
    .from("whatsapp_customers")
    .insert({
      phone_number: phoneNumber,
      referrer_code: referredByCode,
      referrer_id: referrerId,
      organization_id: orgId,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating customer:", error);
    throw error;
  }

  return newCustomer;
}

interface WhacenterPayload {
  from: string;
  message: string;
}

serve(async (req: Request) => {
  try {
    // Handle GET request (webhook verification)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const challenge = url.searchParams.get("hub.challenge");
      const verify_token = url.searchParams.get("hub.verify_token");

      // Optional verification if token is configured
      const expectedToken = Deno.env.get("WHATSAPP_WEBHOOK_TOKEN") || "";
      
      if (expectedToken && verify_token !== expectedToken) {
        return new Response("Forbidden", { status: 403 });
      }

      // Return challenge for verification
      return new Response(challenge || "OK", { status: 200 });
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

    // Parse Whacenter payload - simple format
    // { "from": "6281234567890", "message": "Halo" }
    const rawBody = await req.text();
    console.log("Raw request body:", rawBody);
    
    const payload: WhacenterPayload = JSON.parse(rawBody);
    console.log("Parsed payload:", payload);

    // Validate required fields
    if (!payload.from || !payload.message) {
      return new Response(
        JSON.stringify(createErrorResponse("Missing required fields: from and message", "INVALID_PAYLOAD")),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get default organization
    let organizationId: string | null = null;
    try {
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .single();
      
      if (org && !orgError) {
        organizationId = org.id;
        console.log("Found organization:", organizationId);
      } else {
        console.log("No organization found or error:", orgError);
      }
    } catch (e) {
      console.error("Error getting organization:", e);
    }

    console.log("Using organization_id:", organizationId);

    // Extract referral code from message if present
    let referredByCode: string | undefined;
    const messageText = payload.message;
    
    // Try to extract referral code from message
    // Format: "kode XXXXX" or "referral XXXXX"
    const codeMatch = messageText.match(/kode\s+(?:referral\s+)?[:\s]+([A-Z0-9]{4,10})/i) ||
                      messageText.match(/(?:referral|kode)\s+([A-Z0-9]{4,10})/i);
    if (codeMatch) {
      referredByCode = codeMatch[1].toUpperCase();
      console.log("Referral code detected:", referredByCode);
    }

    // Store incoming message in database (organization_id optional)
    // Get device_id - try to find from whatsapp_devices or use default
    let deviceId: string | null = null;
    try {
      const { data: device } = await supabase
        .from("whatsapp_devices")
        .select("id")
        .limit(1)
        .single();
      
      if (device) {
        deviceId = device.id;
      }
    } catch (e) {
      console.log("No whatsapp device found, will skip device_id");
    }

    const insertData: any = {
      phone_number: payload.from,
      message_type: "text",
      message_text: messageText,
      direction: "inbound",
    };

    // Add device_id if found
    if (deviceId) {
      insertData.device_id = deviceId;
    }

    // Only add organization_id if we have it
    if (organizationId) {
      insertData.organization_id = organizationId;
    }

    const { data: stored, error: storeError } = await supabase
      .from("whatsapp_messages")
      .insert(insertData)
      .select("*")
      .single();

    if (storeError) {
      console.error("Error storing message:", storeError);
    }

    // Check if customer exists and update referral if needed
    if (referredByCode) {
      const { data: existingCustomer } = await supabase
        .from("whatsapp_customers")
        .select("id, referrer_code")
        .eq("phone_number", payload.from)
        .single();

      if (existingCustomer && !existingCustomer.referrer_code) {
        // Update referrer for existing customer
        await supabase
          .from("whatsapp_customers")
          .update({
            referrer_code: referredByCode,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingCustomer.id);

        // Find referrer and increment their referral count
        const { data: referrer } = await supabase
          .from("whatsapp_customers")
          .select("id, total_referrals")
          .eq("my_referral_code", referredByCode)
          .single();

        if (referrer) {
          await supabase
            .from("whatsapp_customers")
            .update({
              total_referrals: (referrer.total_referrals || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq("id", referrer.id);
        }
      }
    }

    // Process AI response with Gemini
    try {
      // Get or create customer
      let customer = await getOrCreateCustomer(supabase, payload.from, referredByCode);
      
      // Generate response using Gemini
      const responseText = await callGemini(messageText);
      
      // Update customer name if they shared it
      const nameMatch = messageText.match(/nama(?:ku|saya)?\s+([A-Za-z]+)/i);
      if (nameMatch) {
        await supabase.from("whatsapp_customers").update({ full_name: nameMatch[1] }).eq("id", customer.id);
      }
      
      // Update last message
      await supabase.from("whatsapp_customers").update({ last_message_at: new Date().toISOString() }).eq("id", customer.id);
      
      // Store outbound message
      await supabase.from("whatsapp_messages").insert({
        phone_number: payload.from,
        message_type: "text",
        message_text: responseText,
        direction: "outbound",
      });
      
      // Send via Whacenter
      const whacenterDeviceId = Deno.env.get("WHACENTER_DEVICE_ID") || "";
      console.log("WHACENTER_DEVICE_ID:", whacenterDeviceId ? "SET" : "NOT SET");
      console.log("Sending to phone:", payload.from);
      
      if (whacenterDeviceId) {
        const result = await sendWhacenterMessage(whacenterDeviceId, payload.from, responseText);
        console.log("Whacenter result:", result);
      } else {
        console.log("Whacenter not configured, not sending response");
      }
      
      console.log("AI Response sent:", responseText);
    } catch (e) {
      console.error("AI processing error:", e);
    }

    return new Response(
      JSON.stringify(
        createSuccessResponse({ message: "Webhook processed" })
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook error:", message);

    return new Response(
      JSON.stringify(createErrorResponse(message, "WEBHOOK_ERROR")),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
