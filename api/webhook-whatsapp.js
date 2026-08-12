// api/webhook-whatsapp.js
// Recebe respostas do WhatsApp via Twilio e salva no Supabase

const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    // A Twilio envia os dados como form-urlencoded
    const body = req.body;

    const from = body.From || ''; // ex: "whatsapp:+5521999999999"
    const profileName = body.ProfileName || ''; // nome do WhatsApp do cliente
    const messageBody = body.Body || '';

    const phone = from.replace('whatsapp:', '').replace('+', '');

    if (!phone) {
      return res.status(200).send('OK - sem telefone');
    }

    const headers = {
      'apikey': SERVICE_KEY,
      'Authorization': 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json'
    };

    // Verifica se já existe esse contato
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sdr_leads?phone=eq.${phone}&select=id`,
      { headers }
    );
    const existing = await checkRes.json();

    if (Array.isArray(existing) && existing.length > 0) {
      // Atualiza contato existente -> marca como "respondeu"
      await fetch(`${SUPABASE_URL}/rest/v1/sdr_leads?phone=eq.${phone}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'respondeu',
          ultima_mensagem: messageBody,
          updated_at: new Date().toISOString()
        })
      });
    } else {
      // Cria novo registro
      await fetch(`${SUPABASE_URL}/rest/v1/sdr_leads`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: phone,
          nome: profileName || 'Sem nome',
          status: 'respondeu',
          origem: 'resposta_campanha',
          ultima_mensagem: messageBody,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });
    }

    // Responde vazio pra Twilio não reenviar auto-reply
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');

  } catch (error) {
    console.error('Erro no webhook:', error);
    return res.status(200).send('OK - erro tratado');
  }
}
