// ══════════════════════════════════════════════════════════════════════════════
// DISCADOR TWILIO — Veracity Intelligence
// Arquivo: api/discador.js
// ══════════════════════════════════════════════════════════════════════════════

const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER  = process.env.TWILIO_FROM_NUMBER;
const TWILIO_TWIML_APP    = process.env.TWILIO_TWIML_APP_SID;
const TWILIO_API_KEY      = process.env.TWILIO_API_KEY;
const TWILIO_API_SECRET   = process.env.TWILIO_API_SECRET;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = body.action;

    // ── GERAR TOKEN DO SDK (para áudio no navegador) ───────────────────────
    if (action === 'token') {
      // Gera Access Token para o Twilio Client SDK
      const { AccessToken, VoiceGrant } = await import('twilio').then(m => ({
        AccessToken: m.default.jwt.AccessToken,
        VoiceGrant:  m.default.jwt.AccessToken.VoiceGrant
      }));

      const grant = new VoiceGrant({
        outgoingApplicationSid: TWILIO_TWIML_APP,
        incomingAllow: true
      });

      const token = new AccessToken(
        TWILIO_ACCOUNT_SID,
        TWILIO_API_KEY,
        TWILIO_API_SECRET,
        { identity: 'sdr_veracity', ttl: 3600 }
      );
      token.addGrant(grant);

      return res.status(200).json({ ok: true, token: token.toJwt() });
    }

    // ── FAZER LIGAÇÃO ──────────────────────────────────────────────────────
    if (action === 'ligar') {
      const { telefone, lead_nome, lead_empresa } = body;
      if (!telefone) return res.status(400).json({ error: 'Telefone obrigatório' });

      let toNumber = telefone.replace(/[^0-9]/g, '');
      if (toNumber.length === 10 || toNumber.length === 11) {
        toNumber = '+55' + toNumber;
      } else if (!toNumber.startsWith('+')) {
        toNumber = '+' + toNumber;
      }

      // TwiML — quando o cliente atender conecta com o navegador do SDR
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Aguarde, conectando com o consultor.</Say>
  <Dial callerId="${TWILIO_FROM_NUMBER}" timeout="30">
    <Client>sdr_veracity</Client>
  </Dial>
</Response>`;

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

    // ── TWIML PARA O SDK (quando o navegador recebe a chamada) ─────────────
    // Twilio chama essa URL quando o cliente atende
    if (body.CallSid || action === 'voice') {
      const twimlResp = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Conectado!</Say>
</Response>`;
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twimlResp);
    }

    return res.status(400).json({ error: 'Action inválida' });

  } catch(e) {
    console.error('Erro discador:', e);
    return res.status(500).json({ error: e.message });
  }
}
