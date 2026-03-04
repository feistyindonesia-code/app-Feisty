// Whacenter API Helper
// Docs: https://whacenter.com/docs/api
// API URL: https://api.whacenter.com/api/send

export interface WhacenterMessage {
  phone: string;
  message: string;
}

export interface WhacenterResponse {
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

/**
 * Send WhatsApp message via Whacenter API
 * 
 * @param deviceId - Device ID dari dashboard Whacenter
 * @param message - Object dengan phone dan message
 */
export async function sendWhacenterMessage(
  deviceId: string,
  message: WhacenterMessage
): Promise<WhacenterResponse> {
  try {
    const response = await fetch('https://api.whacenter.com/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device_id: deviceId,
        phone: message.phone,
        message: message.message,
      }),
    });

    const data = await response.json();

    // Whacenter response format:
    // { status: true, code: 200, data: { id, to, message } }
    // { status: false, code: 400, error: "..." }
    
    if (data.status === true || data.code === 200) {
      return {
        success: true,
        status: data.status,
        code: data.code,
        data: data.data,
      };
    } else {
      return {
        success: false,
        status: data.status,
        code: data.code,
        error: data.error || 'Failed to send message',
      };
    }
  } catch (error) {
    console.error('Whacenter API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format phone number untuk Whacenter
 * Contoh: 6287787655880
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If starts with 0, replace with 62
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  
  // If doesn't start with 62, add it
  if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  
  return cleaned;
}

/**
 * Simple wrapper untuk kirim message
 */
export async function sendWhatsAppMessage(
  deviceId: string,
  phone: string,
  messageText: string
): Promise<WhacenterResponse> {
  const formattedPhone = formatPhoneNumber(phone);
  return sendWhacenterMessage(deviceId, {
    phone: formattedPhone,
    message: messageText,
  });
}
