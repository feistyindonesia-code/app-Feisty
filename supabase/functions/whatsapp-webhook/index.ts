import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.0";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../shared/utils.ts";

// ============================================
// Smart Logic Bot - Rule-Based Conversational Engine
// ============================================

// Supported languages
type Language = 'id' | 'en' | 'ar';

// Conversation states
type ConversationState = 'new_customer' | 'ask_name' | 'browsing_menu' | 'considering_order' | 'ordering' | 'completed';

// Intent keywords
const KEYWORDS = {
  menu: ['menu', 'harga', 'price', 'list', 'makanan', 'food', 'catalogue', 'قائمة', 'طعام'],
  order: ['order', 'pesan', 'beli', 'buy', 'order now', 'pesan sekarang', 'buy now', 'اطلب', 'شراء'],
  greeting: ['halo', 'hello', 'hi', 'hey', 'مرحبا', 'السلام عليكم'],
  thank: ['terima kasih', 'thanks', 'thank you', 'شكرا', '谢谢'],
  confirm: ['ya', 'yes', 'sure', 'ok', 'oke', 'benar', 'نعم'],
};

// Response templates
const RESPONSES = {
  greeting: {
    id: (name?: string) => name 
      ? `Halo 👋 ${name}!\nSelamat datang di Feisty 🔥\n\nSenang bisa membantu kamu!\n\nKalau mau lihat menu, langsung aja ke:\nhttps://feisty.my.id`
      : `Halo 👋\nSelamat datang di Feisty 🔥\n\nKami menyediakan ayam crispy fresh yang dibuat setelah order!\n\nBoleh tahu namanya siapa kak? 😊`,
    en: (name?: string) => name 
      ? `Hello 👋 ${name}!\nWelcome to Feisty 🔥\n\nHappy to help you!\n\nCheck our menu here:\nhttps://feisty.my.id`
      : `Hello 👋\nWelcome to Feisty 🔥\n\nWe serve freshly cooked crispy chicken.\n\nMay I know your name? 😊`,
    ar: (name?: string) => name 
      ? `مرحبا 👋 ${name}!\nأهلا بك في Feisty 🔥\n\nيسعدنا مساعدتك!\n\nاطلب من هنا:\nhttps://feisty.my.id`
      : `مرحبا 👋\nأهلا بك في Feisty 🔥\n\nنقدم دجاج مقلي طازج.\n\nما اسمك؟ 😊`,
  },
  menu: {
    id: () => `Ini menu Feisty 🔥\n\nSilakan pilih di sini:\nhttps://feisty.my.id`,
    en: () => `Here is our menu 🔥\n\nPlease order here:\nhttps://feisty.my.id`,
    ar: () => `هذه قائمة الطعام 🔥\n\nيمكنك الطلب من هنا:\nhttps://feisty.my.id`,
  },
  order: {
    id: () => `Siap kak 😊\n\nSilakan langsung order di sini:\nhttps://feisty.my.id`,
    en: () => `Sure! 😊\n\nPlease order here:\nhttps://feisty.my.id`,
    ar: () => `حاضرا 😊\n\nاطلب من هنا:\nhttps://feisty.my.id`,
  },
  thanks: {
    id: () => `Sama-sama kak! 😊 Senang bisa membantu!\n\nKalau ada yang lain mau ditanyakan, boleh langsung chat lagi ya!`,
    en: () => `You're welcome! 😊 Happy to help!\n\nFeel free to ask if you have any questions!`,
    ar: () => `عفوا! 😊\n\nلا تتردد في طرح أي أسئلة!`,
  },
  nameReceived: {
    id: (name: string) => `Terima kasih Kak ${name} 😊\n\nSenang berkenalan dengan kamu!\n\nKami punya ayam crispy fresh yang dibuat setelah order 🔥\n\nKalau mau lihat menu, bisa di sini:\nhttps://feisty.my.id`,
    en: (name: string) => `Thank you, ${name} 😊\n\nNice to meet you!\n\nWe have freshly cooked crispy chicken 🔥\n\nCheck our menu here:\nhttps://feisty.my.id`,
    ar: (name: string) => `شكرا لك ${name} 😊\n\nتشرفنا!\n\nلدينا دجاج مقلي طازج 🔥\n\nاطلب من هنا:\nhttps://feisty.my.id`,
  },
  default: {
    id: () => `Maaf kak, saya belum paham 😅\n\nTapi kalau mau order atau lihat menu, langsung aja ke:\nhttps://feisty.my.id\n\nAtau chat apa yang bisa saya bantu? 😊`,
    en: () => `Sorry, I didn't quite get that 😅\n\nBut if you want to order or see the menu, go here:\nhttps://feisty.my.id\n\nOr let me know how I can help! 😊`,
    ar: () => `عذرا، لم أفهم 😅\n\nلكن إذا كنت تريد الطلب أو رؤية القائمة:\nhttps://feisty.my.id\n\nأخبرني كيف يمكنني المساعدة! 😊`,
  },
};

// ============================================
// Helper Functions
// ============================================

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

function detectLanguage(message: string): Language {
  // Arabic detection
  const arabicPattern = /[\u0600-\u06FF]/;
  if (arabicPattern.test(message)) {
    return 'ar';
  }
  
  // English detection
  const lowerMessage = message.toLowerCase();
  const englishKeywords = ['hello', 'hi', 'hey', 'thanks', 'thank you', 'yes', 'menu', 'price', 'order', 'buy', 'food'];
  for (const keyword of englishKeywords) {
    if (lowerMessage.includes(keyword)) {
      return 'en';
    }
  }
  
  // Default to Indonesian
  return 'id';
}

function isNameMessage(message: string): boolean {
  // Must be short (1-3 words)
  const words = message.trim().split(/\s+/);
  if (words.length > 3) return false;
  
  // Must only contain letters (including spaces for full name)
  const namePattern = /^[A-Za-z\s]+$/;
  if (!namePattern.test(message.trim())) return false;
  
  // Must not contain any keywords
  const lowerMessage = message.toLowerCase();
  const allKeywords = [...KEYWORDS.menu, ...KEYWORDS.order, ...KEYWORDS.greeting, ...KEYWORDS.thank];
  for (const keyword of allKeywords) {
    if (lowerMessage.includes(keyword)) return false;
  }
  
  return true;
}

function detectIntent(message: string): string | null {
  const lowerMessage = message.toLowerCase();
  
  // Check for greeting
  for (const keyword of KEYWORDS.greeting) {
    if (lowerMessage.includes(keyword)) return 'greeting';
  }
  
  // Check for menu
  for (const keyword of KEYWORDS.menu) {
    if (lowerMessage.includes(keyword)) return 'menu';
  }
  
  // Check for order intent
  for (const keyword of KEYWORDS.order) {
    if (lowerMessage.includes(keyword)) return 'order';
  }
  
  // Check for thanks
  for (const keyword of KEYWORDS.thank) {
    if (lowerMessage.includes(keyword)) return 'thank';
  }
  
  return null;
}

function generateResponse(
  intent: string | null,
  state: ConversationState,
  language: Language,
  customerName?: string
): string {
  // Handle first-time greeting
  if (state === 'new_customer') {
    return RESPONSES.greeting[language](customerName);
  }
  
  // Handle name detection response
  if (intent === 'greeting' && customerName) {
    return RESPONSES.greeting[language](customerName);
  }
  
  // Handle intents
  switch (intent) {
    case 'menu':
      return RESPONSES.menu[language]();
    case 'order':
      return RESPONSES.order[language]();
    case 'thank':
      return RESPONSES.thanks[language]();
    case 'greeting':
      return RESPONSES.greeting[language](customerName);
    default:
      // Check if we should ask for name
      if (state === 'ask_name' || !customerName) {
        return language === 'id' 
          ? `Boleh tahu namanya siapa kak? 😊`
          : language === 'en'
          ? `May I know your name? 😊`
          : `ما اسمك؟ 😊`;
      }
      return RESPONSES.default[language]();
  }
}

// ============================================
// Database Functions
// ============================================

async function getOrCreateCustomer(supabase: any, phoneNumber: string): Promise<any> {
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

  // Create new customer
  const { data: newCustomer, error } = await supabase
    .from("whatsapp_customers")
    .insert({
      phone_number: normalizedPhone,
      language: 'id',
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating customer:", error);
    throw error;
  }

  console.log("New customer created:", newCustomer.id);
  return newCustomer;
}

async function getOrCreateConversationState(supabase: any, customerId: string): Promise<any> {
  const { data: existing } = await supabase
    .from("conversation_state")
    .select("*")
    .eq("customer_id", customerId)
    .single();

  if (existing) {
    return existing;
  }

  // Create new conversation state
  const { data: newState, error } = await supabase
    .from("conversation_state")
    .insert({
      customer_id: customerId,
      state: 'new_customer',
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error creating conversation state:", error);
    throw error;
  }

  return newState;
}

async function updateConversationState(
  supabase: any,
  customerId: string,
  updates: {
    state?: ConversationState;
    last_intent?: string;
    last_message?: string;
    context?: Record<string, any>;
  }
): Promise<void> {
  const updateData: Record<string, any> = {};
  
  if (updates.state) updateData.state = updates.state;
  if (updates.last_intent) updateData.last_intent = updates.last_intent;
  if (updates.last_message) updateData.last_message = updates.last_message;
  if (updates.context) updateData.context = JSON.stringify(updates.context);
  
  await supabase
    .from("conversation_state")
    .update(updateData)
    .eq("customer_id", customerId);
}

async function updateCustomerLanguage(supabase: any, customerId: string, language: Language): Promise<void> {
  await supabase
    .from("whatsapp_customers")
    .update({ language })
    .eq("id", customerId);
}

async function updateCustomerName(supabase: any, customerId: string, name: string): Promise<void> {
  await supabase
    .from("whatsapp_customers")
    .update({ full_name: name })
    .eq("id", customerId);
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
      console.error("Missing required fields");
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
    const normalizedFrom = normalizePhoneNumber(payload.from);
    const messageText = payload.message.trim();

    // Get or create customer
    const customer = await getOrCreateCustomer(supabase, normalizedFrom);
    
    // Get or create conversation state
    const convState = await getOrCreateConversationState(supabase, customer.id);
    
    // Detect language from message
    const detectedLanguage = detectLanguage(messageText);
    
    // Update customer language if different
    if (customer.language !== detectedLanguage) {
      await updateCustomerLanguage(supabase, customer.id, detectedLanguage);
    }
    
    const language = detectedLanguage as Language;
    const currentState = convState.state as ConversationState;
    
    // Detect name if in ask_name state or message looks like a name
    let customerName = customer.full_name;
    let newState = currentState;
    let intent = detectIntent(messageText);
    
    // Check for name detection
    if (!customerName && (currentState === 'ask_name' || isNameMessage(messageText))) {
      // This looks like a name
      const nameFromMessage = messageText.split(/\s+/).map((w: string) => 
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      ).join(' ');
      
      await updateCustomerName(supabase, customer.id, nameFromMessage);
      customerName = nameFromMessage;
      newState = 'browsing_menu';
      
      // Generate name received response
      const responseText = RESPONSES.nameReceived[language](customerName);
      
      // Store inbound message
      await supabase.from("whatsapp_messages").insert({
        phone_number: normalizedFrom,
        message_type: "text",
        message_text: messageText,
        direction: "inbound",
      });
      
      // Store outbound message
      await supabase.from("whatsapp_messages").insert({
        phone_number: normalizedFrom,
        message_type: "text",
        message_text: responseText,
        direction: "outbound",
      });
      
      // Update conversation state
      await updateConversationState(supabase, customer.id, {
        state: newState,
        last_intent: 'name_provided',
        last_message: messageText,
      });
      
      // Send response
      const whacenterDeviceId = Deno.env.get("WHACENTER_DEVICE_ID") || "";
      if (whacenterDeviceId && whacenterDeviceId !== "true") {
        await sendWhacenterMessage(whacenterDeviceId, normalizedFrom, responseText);
      }
      
      return new Response(
        JSON.stringify(createSuccessResponse({ 
          message: "Name detected and response sent",
          customer_id: customer.id,
        })),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Generate response based on intent and state
    const responseText = generateResponse(intent, currentState, language, customerName);
    
    // Update conversation state
    if (intent === 'order') {
      newState = 'ordering';
    } else if (intent === 'menu') {
      newState = 'browsing_menu';
    }
    
    await updateConversationState(supabase, customer.id, {
      state: newState,
      last_intent: intent || undefined,
      last_message: messageText,
    });

    // Store inbound message
    await supabase.from("whatsapp_messages").insert({
      phone_number: normalizedFrom,
      message_type: "text",
      message_text: messageText,
      direction: "inbound",
    });

    // Store outbound message
    await supabase.from("whatsapp_messages").insert({
      phone_number: normalizedFrom,
      message_type: "text",
      message_text: responseText,
      direction: "outbound",
    });

    // Send response via Whacenter
    const whacenterDeviceId = Deno.env.get("WHACENTER_DEVICE_ID") || "";
    console.log("WHACENTER_DEVICE_ID:", whacenterDeviceId);
    
    if (whacenterDeviceId && whacenterDeviceId !== "true") {
      const result = await sendWhacenterMessage(whacenterDeviceId, normalizedFrom, responseText);
      console.log("Whacenter send result:", JSON.stringify(result));
    }

    return new Response(
      JSON.stringify(createSuccessResponse({ 
        message: "Webhook processed",
        customer_id: customer.id,
        response_sent: !!whacenterDeviceId,
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
