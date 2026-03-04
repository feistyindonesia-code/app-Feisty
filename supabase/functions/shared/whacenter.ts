// Whacenter API Helper
// Docs: https://whacenter.com/docs/api

export interface WhacenterMessage {
  phone: string;
  message: string;
}

export interface WhacenterResponse {
  success: boolean;
  message_id?: string;
  error?: string;
}

/**
 * Send WhatsApp message via Whacenter API
 */
export async function sendWhacenterMessage(
  apiKey: string,
  deviceKey: string,
  message: WhacenterMessage
): Promise<WhacenterResponse> {
  try {
    const response = await fetch('https://whacenter-api.com/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        device_key: deviceKey,
        phone: message.phone,
        message: message.message,
      }),
    });

    const data = await response.json();

    if (data.status === true || data.code === 200) {
      return {
        success: true,
        message_id: data.data?.id || data.message_id,
      };
    } else {
      return {
        success: false,
        error: data.message || 'Failed to send message',
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
 * Send bulk WhatsApp messages via Whacenter API
 */
export async function sendWhacenterBulkMessage(
  apiKey: string,
  deviceKey: string,
  messages: WhacenterMessage[]
): Promise<WhacenterResponse[]> {
  const results: WhacenterResponse[] = [];
  
  for (const message of messages) {
    const result = await sendWhacenterMessage(apiKey, deviceKey, message);
    results.push(result);
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

/**
 * Format phone number for Indonesian format
 */
export function formatIndonesianPhone(phone: string): string {
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
  
  return cleaned + '@c.us';
}

/**
 * Simple WhatsApp message format (for basic text)
 */
export function formatSimpleMessage(
  phone: string,
  message: string
): { phone: string; message: string } {
  // Whacenter uses simple format
  return {
    phone: phone,
    message: message,
  };
}
