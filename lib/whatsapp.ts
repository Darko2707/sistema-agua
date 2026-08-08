type WhatsAppResult =
  | { sent: true; provider: 'meta' }
  | { sent: false; provider: 'dev'; code: string };

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `52${digits}`;
  return digits;
}

export function formatPhoneForWhatsApp(phone: string): string {
  return normalizePhone(phone);
}

export async function sendWhatsAppVerificationCode(phone: string, code: string): Promise<WhatsAppResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_VERIFY_TEMPLATE ?? 'sis4s_codigo_verificacion';
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_MX';

  if (!token || !phoneNumberId) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WhatsApp no esta configurado');
    }
    return { sent: false, provider: 'dev', code };
  }

  const response = await fetch(graphUrl(phoneNumberId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(phone),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`No se pudo enviar WhatsApp: ${text.slice(0, 300)}`);
  }

  return { sent: true, provider: 'meta' };
}

export async function sendWhatsAppTemplateMessage(
  phone: string,
  templateName: string,
  params: string[],
): Promise<WhatsAppResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const languageCode = process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_MX';

  if (!token || !phoneNumberId) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('WhatsApp no esta configurado');
    }
    return { sent: false, provider: 'dev', code: params.join(' | ') };
  }

  const response = await fetch(graphUrl(phoneNumberId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(phone),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: params.map(text => ({ type: 'text', text })),
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`No se pudo enviar WhatsApp: ${text.slice(0, 300)}`);
  }

  return { sent: true, provider: 'meta' };
}


function graphUrl(phoneNumberId: string): string {
  const version = process.env.WHATSAPP_GRAPH_VERSION ?? 'v25.0';
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}
