// ══════════════════════════════════════════════════════════════════════════════
// DISCADOR TWILIO — Veracity Intelligence
// Arquivo: api/discador.js
// ══════════════════════════════════════════════════════════════════════════════

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER; // +19129153919

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action } = body;

    // ── FAZER LIGAÇÃO ──────────────────────────────────────────────────────
    if (action === 'ligar') {
      const { telefone, lead_nome, lead_empresa, user_phone } = body;

      if (!telefone) return res.status(400).json({ error: 'Telefone obrigatório' });

      // Formata número para padrão E.164
      let toNumber = telefone.replace(/[^0-9]/g, '');
      if (toNumber.length === 10 || toNumber.length === 11) {
        toNumber = '+55' + toNumber;
      } else if (!toNumber.startsWith('+')) {
        toNumber = '+' + toNumber;
      }

      // TwiML — o que acontece quando o destino atender
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Ligação da Veracity Intelligence. Conectando com o corretor.</Say>
  <Dial callerId="${TWILIO_FROM_NUMBER}">
    <Number>${user_phone || TWILIO_FROM_NUMBER}</Number>
  </Dial>
</Response>`;

      // Cria a chamada via Twilio API
      const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      const callRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            To:   toNumber,
            From: TWILIO_FROM_NUMBER,
            Twiml: twiml,
            StatusCallback: 'https://veracitytech.com.br/api/discador',
            StatusCallbackMethod: 'POST',
            StatusCallbackEvent: 'initiated ringing answered completed'
          })
        }
      );

      const callData = await callRes.json();

      if (!callRes.ok) {
        console.error('Twilio error:', callData);
        return res.status(400).json({ error: callData.message || 'Erro ao fazer ligação' });
      }

      return res.status(200).json({
        ok: true,
        call_sid: callData.sid,
        status: callData.status,
        to: toNumber,
        lead_nome,
        lead_empresa
      });
    }

    // ── WEBHOOK DE STATUS DA LIGAÇÃO ───────────────────────────────────────
    if (action === 'status' || req.method === 'POST' && body.CallSid) {
      const { CallSid, CallStatus, Duration, To } = body;

      console.log('Call status:', CallSid, CallStatus, Duration);

      // Aqui você pode salvar o status no Supabase se quiser
      // Por enquanto só retorna OK para o Twilio
      return res.status(200).send('<Response></Response>');
    }

    // ── GERAR TOKEN PARA TWILIO CLIENT (ligação pelo browser) ──────────────
    if (action === 'token') {
      // Para ligar diretamente pelo browser sem precisar de headset físico
      // Requer Twilio Client SDK - implementação futura
      return res.status(200).json({ ok: true, msg: 'Token endpoint - em breve' });
    }

    return res.status(400).json({ error: 'Action inválida' });

  } catch(e) {
    console.error('Erro discador:', e);
    return res.status(500).json({ error: e.message });
  }
}
