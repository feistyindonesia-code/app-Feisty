import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../shared/utils.ts";

// ============================================
// AI Dispatcher Logic (embedded)
// ============================================

interface AIIntent {
  type: string;
  confidence: number;
  parameters: Record<string, any>;
}

const MARKETING_MESSAGES = {
  greeting: [
    "Hai {name}! 👋 Selamat datang di Feisty! Senang bisa kenal dengan kamu. Ada yang bisa kita bantu hari ini?",
    "Halo {name}! 🌟 Welcome to Feisty! Kami senang sekali kamu sudah bergabung dengan kami. Mau pesan apa hari ini?",
  ],
  greeting_no_name: [
    "Hai! 👋 Selamat datang di Feisty! Senang bisa kenal dengan kamu. Boleh tau nama kamu siapa?",
    "Halo! 🌟 Welcome to Feisty! Siapa nih namanya?",
  ],
  menu: [
    "📦 *PAKET KAMI:*\n\n{message}\n\n✨ Mau pilih yang mana?",
  ],
  order_cta: [
    "👆 Klik di atas untuk pesan! 🛒",
    "🔥 Gas order sekarang!",
  ],
  referral: [
    "🎁 *REFERRAL FEISTY*\n\nAjak teman dan dapat komisi!\n\nKetik 'share' untuk dapat link!",
  ],
  share_link: [
    "📤 *LINK REFERRAL KAMU:*\n\nwa.me/6287787655880?text={message}\n\n✨ Bagikan ke teman!",
  ],
};

function classifyIntent(message: string): AIIntent {
  const m = message.toLowerCase().trim();
  if (/^(halo|hai|hi|hey)/.test(m)) return { type: "greeting", confidence: 0.9, parameters: {} };
  if (/nama/i.test(m)) return { type: "get_name", confidence: 0.85, parameters: { name: message.trim() } };
  if (/(menu|paket|makanan)/.test(m)) return { type: "menu_inquiry", confidence: 0.85, parameters: {} };
  if (/(pesanan|order|status)/.test(m)) return { type: "order_status", confidence: 0.8, parameters: {} };
  if (/(referral|undang|teman)/.test(m)) return { type: "referral_info", confidence: 0.85, parameters: {} };
  if (/share|bagian/i.test(m) && /referral/i.test(m)) return { type: "share_referral", confidence: 0.8, parameters: {} };
  if (/(komplain|keluhan)/.test(m)) return { type: "complaint", confidence: 0.7, parameters: {} };
  return { type: "unknown", confidence: 0.5, parameters: {} };
}

function getRandomMessage(msgs: string[]): string {
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function formatMessage(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  return result;
}

async function generateAIResponse(
  intent: AIIntent,
  customer: any,
  supabase: any,
  originalMessage: string
): Promise<string> {
  // Handle name capture
  if (intent.type === "get_name") {
    let name = originalMessage.replace(/^(nama|saya|aku)/i, '').trim();
    if (name.length < 2) name = originalMessage.trim();
    
    await supabase.from("whatsapp_customers").update({ full_name: name }).eq("id", customer.id);
    return formatMessage(getRandomMessage(MARKETING_MESSAGES.greeting), { name });
  }

  // Handle greeting
  if (intent.type === "greeting") {
    if (customer.full_name) {
      return formatMessage(getRandomMessage(MARKETING_MESSAGES.greeting), { name: customer.full_name });
    }
    return getRandomMessage(MARKETING_MESSAGES.greeting_no_name);
  }

  // Handle menu inquiry
  if (intent.type === "menu_inquiry") {
    const { data: bundles } = await supabase.from("bundles").select("name, description").eq("is_active", true).limit(5);
    if (!bundles || bundles.length === 0) return "Maaf, sedang tidak ada paket tersedia.";
    
    let list = bundles.map((b: any, i: number) => `${i+1}. *${b.name}* - ${b.description||''}`).join("\n");
    return formatMessage(getRandomMessage(MARKETING_MESSAGES.menu), { message: list }) + "\n" + getRandomMessage(MARKETING_MESSAGES.order_cta);
  }

  // Handle order status
  if (intent.type === "order_status") {
    const { data: orders } = await supabase.from("orders").select("order_number, status").eq("customer_phone", customer.phone_number).order("created_at", { ascending: false }).limit(3);
    if (!orders || orders.length === 0) return "Belum ada pesanan. Mau pesan? feisty.app/weborder";
    return "📦 *Status:*\n" + orders.map((o: any) => `${o.order_number} - ${o.status}`).join("\n");
  }

  // Handle referral info
  if (intent.type === "referral_info") {
    return getRandomMessage(MARKETING_MESSAGES.referral);
  }

  // Handle share referral
  if (intent.type === "share_referral") {
    const code = customer.my_referral_code || "(belum ada)";
    const msg = encodeURIComponent(`Coba Feisty! Kode ref: ${code}`);
    return formatMessage(getRandomMessage(MARKETING_MESSAGES.share_link), { message: msg });
  }

  // Handle complaint
  if (intent.type === "complaint") {
    return "Mohon maaf atas ketidaknyamanan. Ceritakan masalahnya, kami akan bantu! 🙏";
  }

  // Default
  if (!customer.full_name) return "Senang chat dengan kamu! Boleh tau nama kamu? 😊";
  return `Halo ${customer.full_name}! 👋 Ketik 'menu' untuk lihat paket, 'referral' untuk ajak teman!`;
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
      body: JSON.stringify({ device_id: deviceId, phone: cleaned, message: messageText }),
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

    // Process AI response directly (no more invoke needed)
    try {
      // Get or create customer
      let customer = await getOrCreateCustomer(supabase, payload.from, referredByCode);
      
      // Classify intent
      const intent = classifyIntent(messageText);
      
      // Generate response
      const responseText = await generateAIResponse(intent, customer, supabase, messageText);
      
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
