export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };

  try {
    const body = req.body || {};

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, msg: 'Webhook Twilio ativo' });
    }

    const from = body.From || '';
    const profileName = body.ProfileName || '';
    const messageBody = body.Body || '';
    const messageId = body.MessageSid || body.SmsMessageSid || '';

    const phone = from.replace('whatsapp:', '').replace('+', '');

    if (!phone) {
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }

    if (messageId) {
      try {
        const dupCheck = await fetch(
          SUPABASE_URL + '/rest/v1/sdr_processados?message_id=eq.' + encodeURIComponent(messageId) + '&select=message_id',
          { headers }
        );
        const dupData = dupCheck.ok ? await dupCheck.json() : [];
        if (Array.isArray(dupData) && dupData.length > 0) {
          res.setHeader('Content-Type', 'text/xml');
          return res.status(200).send('<Response></Response>');
        }
        await fetch(SUPABASE_URL + '/rest/v1/sdr_processados', {
          method: 'POST',
          headers: Object.assign({}, headers, { 'Prefer': 'resolution=ignore-duplicates,return=minimal' }),
          body: JSON.stringify({ message_id: messageId, phone: phone })
        });
      } catch (e) {}
    }

    const checkRes = await fetch(
      SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone + '&select=id',
      { headers }
    );
    const existing = checkRes.ok ? await checkRes.json() : [];

    if (Array.isArray(existing) && existing.length > 0) {
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: 'respondeu',
          ultima_mensagem: messageBody,
          updated_at: new Date().toISOString()
        })
      });
    } else {
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads', {
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

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');

  } catch (e) {
    console.error('Erro webhook Twilio:', e);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }
}
