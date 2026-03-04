import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../shared/utils.ts";

// ============================================
// Whacenter API Helper (embedded for deployment)
// ============================================
interface WhacenterMessage {
  phone: string;
  message: string;
}

interface WhacenterResponse {
  success: boolean;
  status?: boolean;
  code?: number;
  data?: {
    id?: string;
    to?: string;
    message?: string;
  };
  error?: string;
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  return cleaned;
}

async function sendWhacenterMessage(
  deviceId: string,
  message: WhacenterMessage
): Promise<WhacenterResponse> {
  try {
    const response = await fetch('https://api.whacenter.com/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        phone: message.phone,
        message: message.message,
      }),
    });
    const data = await response.json();
    if (data.status === true || data.code === 200) {
      return { success: true, status: data.status, code: data.code, data: data.data };
    } else {
      return { success: false, status: data.status, code: data.code, error: data.error || 'Failed to send message' };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function sendWhatsAppMessage(
  deviceId: string,
  phone: string,
  messageText: string
): Promise<WhacenterResponse> {
  const formattedPhone = formatPhoneNumber(phone);
  return sendWhacenterMessage(deviceId, { phone: formattedPhone, message: messageText });
}

interface AIDispatcherRequest {
  message: string;
  phone_number: string;
  device_id?: string;
  organization_id?: string;
  referred_by_code?: string;
}

interface AIIntent {
  type:
    | "greeting"
    | "get_name"
    | "menu_inquiry"
    | "order_status"
    | "create_order"
    | "referral_info"
    | "share_referral"
    | "complaint"
    | "support"
    | "unknown";
  confidence: number;
  parameters: Record<string, any>;
}

// Marketing messages - warm, friendly, persuasive
const MARKETING_MESSAGES = {
  greeting: [
    "Hai {name}! 👋 Selamat datang di Feisty! Senang bisa kenal dengan kamu. Ada yang bisa kita bantu hari ini?",
    "Halo {name}! 🌟 Welcome to Feisty! Kami senang sekali kamu sudah bergabung dengan kami. Mau pesan apa hari ini?",
    "Hi {name}! 🎉 Terima kasih sudah menghubungi Feisty! Yuk, siapa tau ada yang kamu suka hari ini?",
  ],
  greeting_no_name: [
    "Hai! 👋 Selamat datang di Feisty! Senang bisa kenal dengan kamu. Boleh tau nama kamu siapa?",
    "Halo! 🌟 Welcome to Feisty! Kami senang sekali kamu sudah menghubungi kami. Siapa nih namanya?",
    "Hi! 🎉 Terima kasih sudah chat Feisty! Boleh kenalan dulu, siapa namanya?",
  ],
  menu: [
    "📦 *PAKET KAMI:*\n\n{message}\n\n✨ Semua paket ini sudah termasuk makanan favorit kamu! Mau pilih yang mana? Klik pesanan di atas ya!",
    "🍔 *MENU PAKET:*\n\n{message}\n\n🎁 Setiap paket sudah disediakan dengan kualitas terbaik untuk kamu!",
  ],
  order_cta: [
    "👆 Klik link di atas untuk pesan sekarang! 🛒",
    "🔥 Gas order sekarang sebelum kehabisan!",
    "🎉 Yuk langsung pesan, kamu bakal dapat pengalaman makan yanglezat!",
  ],
  referral: [
    "🎁 *REFFERAL FEISTY*\n\n{names} sudah berbagi kebahagiaan ke {count} teman! Setiap teman yang daftar & pesan lewat link kamu, kamu bakal dapat komisi dari pesanannya! komisi dihitung berdasarkan siapa yang benar2 orderan bukan upline!\n\n📤 Mau share ke teman? Bilang saja:\n'share' atau 'bagikan' ya!",
  ],
  share_link: [
    "📤 *LINK REFERRAL KAMU:*\n\nWa.me/6287787655880?text={message}\n\n✨ Bagikan ke teman kamu dan dapat komisi dari setiap orderan mereka!",
  ],
};

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

    if (!requestBody.message || !requestBody.phone_number) {
      return new Response(
        JSON.stringify(
          createErrorResponse("Missing required fields", "MISSING_FIELDS")
        ),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get or create customer
    let customer = await getOrCreateCustomer(
      supabase,
      requestBody.phone_number,
      requestBody.referred_by_code
    );

    // Classify intent
    const intent = await classifyIntent(requestBody.message);

    // Generate response based on intent and customer state
    let response = await generateResponse(
      intent,
      customer,
      supabaseUrl,
      supabaseServiceKey,
      requestBody.message
    );

    // Update last message timestamp
    await supabase
      .from("whatsapp_customers")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", customer.id);

    // Store messages
    await supabase.from("whatsapp_messages").insert({
      phone_number: requestBody.phone_number,
      message_type: "text",
      message_text: requestBody.message,
      direction: "inbound",
    });

    await supabase.from("whatsapp_messages").insert({
      phone_number: requestBody.phone_number,
      message_type: "text",
      message_text: response,
      direction: "outbound",
    });

    // Send response via Whacenter
    const whacenterDeviceId = Deno.env.get("WHACENTER_DEVICE_ID") || "";
    
    if (whacenterDeviceId) {
      const result = await sendWhatsAppMessage(whacenterDeviceId, requestBody.phone_number, response);
      console.log("Whacenter send result:", result);
    } else {
      console.log("Whacenter not configured, response not sent to:", requestBody.phone_number);
    }

    return new Response(
      JSON.stringify(
        createSuccessResponse({
          response,
          intent: intent.type,
          customer_name: customer.full_name,
          customer_referral_code: customer.my_referral_code,
        })
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("AI Dispatcher error:", message);

    return new Response(
      JSON.stringify(createErrorResponse(message, "ERROR")),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

async function getOrCreateCustomer(
  supabase: any,
  phoneNumber: string,
  referredByCode?: string
): Promise<any> {
  // Check if customer exists
  const { data: existing } = await supabase
    .from("whatsapp_customers")
    .select("*")
    .eq("phone_number", phoneNumber)
    .single();

  if (existing) {
    return existing;
  }

  // Find referrer if code provided
  let referrerId = null;
  let referrerData = null;

  if (referredByCode) {
    const { data: referrer } = await supabase
      .from("whatsapp_customers")
      .select("id, full_name")
      .eq("my_referral_code", referredByCode)
      .single();

    if (referrer) {
      referrerId = referrer.id;
      referrerData = referrer;
    }
  }

  // Create new customer
  const { data: newCustomer, error } = await supabase
    .from("whatsapp_customers")
    .insert({
      phone_number: phoneNumber,
      referrer_code: referredByCode,
      referrer_id: referrerId,
      organization_id: (await getDefaultOrganization(supabase)) || null,
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating customer:", error);
    throw error;
  }

  // If referred, notify the referrer (optional - can be implemented later)
  if (referrerData) {
    console.log(`New customer referred by ${referrerData.full_name}`);
  }

  return newCustomer;
}

async function getDefaultOrganization(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .single();

  return data?.id || null;
}

async function classifyIntent(message: string): Promise<AIIntent> {
  const lowerMessage = message.toLowerCase().trim();

  // Greeting patterns
  if (/^(halo|hai|hi|hey|assalamualaikum|selamat|salam|apa kabar)/.test(lowerMessage)) {
    return { type: "greeting", confidence: 0.9, parameters: {} };
  }

  // Name response - contains name-like words (common Indonesian names)
  if (/^(nama saya|namaku|saya|nama|width|jan|dian|tri|putri|adi| Budi|ani|siti|made|ketut|agus|heru|eka|eka|依莎)/.test(lowerMessage) || 
      /^[A-Z][a-z]+(\s[A-Z][a-z]+)?$/.test(message.trim())) {
    return { type: "get_name", confidence: 0.85, parameters: { name: message.trim() } };
  }

  // Menu inquiry
  if (/(menu|produk|paket|makanan|minuman|apa(.*?)ada|tersedia|catalog)/.test(lowerMessage)) {
    return { type: "menu_inquiry", confidence: 0.85, parameters: {} };
  }

  // Order status
  if (/(pesanan|order|status|dimana|progress|lagi|cek)/.test(lowerMessage)) {
    return { type: "order_status", confidence: 0.8, parameters: {} };
  }

  // Create order / buy
  if (/(pesan|beli|order|mau|nanti|belum|pake|gunain)/.test(lowerMessage)) {
    return { type: "create_order", confidence: 0.75, parameters: {} };
  }

  // Referral
  if (/(referral|undang|teman|share|bagikan|kode|ajak)/.test(lowerMessage)) {
    return { type: "referral_info", confidence: 0.85, parameters: {} };
  }

  // Share referral link
  if (/(share|bagikan|link|aku|mau)/.test(lowerMessage) && /referral/i.test(lowerMessage)) {
    return { type: "share_referral", confidence: 0.8, parameters: {} };
  }

  // Complaint
  if (/(komplain|keluhan|masalah|gagal|tidak|salah|kecewa|rusak)/.test(lowerMessage)) {
    return { type: "complaint", confidence: 0.7, parameters: {} };
  }

  // Support
  if (/(bantuan|tolong|help|bisa|can)/.test(lowerMessage)) {
    return { type: "support", confidence: 0.6, parameters: {} };
  }

  return { type: "unknown", confidence: 0.5, parameters: {} };
}

function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

function formatMessage(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  return result;
}

async function generateResponse(
  intent: AIIntent,
  customer: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  originalMessage: string
): Promise<string> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Handle name capture
  if (intent.type === "get_name") {
    // Extract name from message
    let name = originalMessage
      .replace(/^(nama saya|namaku|saya|nama|width)/i, '')
      .trim();
    
    if (name.length < 2) {
      name = originalMessage.trim();
    }

    // Update customer name
    await supabase
      .from("whatsapp_customers")
      .update({ full_name: name })
      .eq("id", customer.id);

    return formatMessage(getRandomMessage(MARKETING_MESSAGES.greeting), { name });
  }

  // Handle greeting
  if (intent.type === "greeting") {
    if (customer.full_name) {
      return formatMessage(getRandomMessage(MARKETING_MESSAGES.greeting), { 
        name: customer.full_name 
      });
    } else {
      return getRandomMessage(MARKETING_MESSAGES.greeting_no_name);
    }
  }

  // Handle menu inquiry - show bundles only, no prices
  if (intent.type === "menu_inquiry") {
    const { data: bundles } = await supabase
      .from("bundles")
      .select("name, description")
      .eq("is_active", true)
      .limit(5);

    if (!bundles || bundles.length === 0) {
      return "Maaf ya, sedang tidak ada paket yang tersedia. Coba lagi nanti ya! 🙏";
    }

    let bundleList = bundles.map((b, i) => 
      `${i + 1}. *${b.name}*\n   ${b.description || 'Paket spesial untuk kamu!'}`
    ).join("\n\n");

    return formatMessage(getRandomMessage(MARKETING_MESSAGES.menu), {
      message: bundleList,
    }) + "\n\n" + getRandomMessage(MARKETING_MESSAGES.order_cta);
  }

  // Handle order status
  if (intent.type === "order_status") {
    const { data: orders } = await supabase
      .from("orders")
      .select("order_number, status, total, created_at")
      .eq("customer_phone", customer.phone_number)
      .order("created_at", { ascending: false })
      .limit(3);

    if (!orders || orders.length === 0) {
      return "Belum ada pesanan dari kamu nih. Mau pesan pertama kamu? Klik di sini: 🌐 feisty.app/weborder";
    }

    let orderList = orders.map((o) => 
      `📋 ${o.order_number} - Status: *${o.status}*`
    ).join("\n");

    return `📦 *Status Pesanan Kamu:*\n\n${orderList}\n\nPesan lagi? feisty.app/weborder 🚀`;
  }

  // Handle create order
  if (intent.type === "create_order") {
    const referralPart = customer.my_referral_code 
      ? `\n\n🎁 Gunakan kode *${customer.my_referral_code}* untuk dapat benefit!`
      : "";

    return `🔥 Siap nih! Yuk pesan lewat web agar lebih mudah pilih-pilih menu!\n\n🌐 *feisty.app/weborder*${referralPart}\n\n Kalau ada yang bingung, chat lagi ya! 😊`;
  }

  // Handle referral info
  if (intent.type === "referral_info") {
    const { count } = await supabase
      .from("whatsapp_customers")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", customer.id);

    const referralCount = count || 0;
    const referrerName = customer.full_name || "Temanmu";

    return formatMessage(getRandomMessage(MARKETING_MESSAGES.referral), {
      names: referrerName,
      count: referralCount.toString(),
    });
  }

  // Handle share referral
  if (intent.type === "share_referral") {
    if (!customer.my_referral_code) {
      return "Maaf, kode referral kamu belum siap. Coba chat lagi ya!";
    }

    const shareMessage = `Halo! Aku sudah pesan di Feisty dan.enak banget! 🎉 Coba kamu juga pakai kode referralku: *${customer.my_referral_code}* biar dapat manfaat bareng!`;

    return formatMessage(getRandomMessage(MARKETING_MESSAGES.share_link), {
      message: encodeURIComponent(shareMessage),
    });
  }

  // Handle complaint
  if (intent.type === "complaint") {
    return "Kami maaf sekali kalau ada yang kurang berkenan. 🙏 Ceritakan masalahnya, kami akan segera bantu! Setiap masukan sangat berarti untuk kami.";
  }

  // Default / unknown - ask for name or show menu
  if (intent.type === "unknown") {
    if (!customer.full_name) {
      return "Senang bisa chat dengan kamu! Boleh tau nama kamu dulu? 😊";
    }

    return `Halo ${customer.full_name}! 👋 Ada yang bisa kami bantu?\n\n🍔 Ketik 'menu' untuk lihat paket\n📦 Ketik 'referral' untuk info undangan teman\n🌐 Ketik 'order' untuk pesan langsung`;
  }

  // Support
  if (intent.type === "support") {
    return "Tentu! Kami siap membantu. Kamu bisa:\n📝 Chat ini untuk pertanyaan umum\n🌐 feisty.app/weborder untuk pesan online\n📞 Hubungi outlet terdekat\n\nApa yang kamu butuhkan? 😊";
  }

  return "Terima kasih sudah menghubungi Feisty! Ada yang bisa kami bantu? 😊";
}
