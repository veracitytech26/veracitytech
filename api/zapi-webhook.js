// ══════════════════════════════════════════════════════════════════════════════
// Z-API WEBHOOK — SDR IA com Claude
// Arquivo: api/zapi-webhook.js
// Recebe mensagens do WhatsApp e responde com IA
// ══════════════════════════════════════════════════════════════════════════════

const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN    = process.env.ZAPI_TOKEN;
const ZAPI_URL      = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL  = 'https://nfusabwpxpdcqedrehrc.supabase.co';
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM   = process.env.TWILIO_FROM_NUMBER;

const SDR_SYSTEM = `Você é um assistente de vendas da Veracity Seguros, especializada em planos de saúde empresariais no Rio de Janeiro.

Seu objetivo é qualificar leads de forma natural e humanizada pelo WhatsApp.

REGRAS IMPORTANTES:
- Seja natural, curto e direto. Máximo 2-3 frases por mensagem.
- Nunca mencione que é uma IA
- Use linguagem informal mas profissional
- Nunca mande listas ou textos longos
- Use emojis com moderação

FLUXO DE QUALIFICAÇÃO:
const SDR_SYSTEM = `Você é um assistente de vendas da Veracity Seguros, especializada em planos de saúde empresariais no Rio de Janeiro.

Seu objetivo é qualificar leads e marcar uma conversa com o consultor.

REGRAS IMPORTANTES:
- Seja natural, curto e direto. Máximo 2 frases por mensagem.
- Nunca mencione que é uma IA
- Use linguagem informal mas profissional
- Nunca mande listas ou textos longos
- Use emojis com moderação
- NUNCA encerre a conversa sem tentar marcar uma ligação

FLUXO DE QUALIFICAÇÃO:
1. Quando confirmar que é o responsável: pergunte se a empresa tem plano de saúde
2. Se TEM plano: pergunte quantas vidas tem na empresa
3. Se NÃO TEM plano: diga que tem opções a partir de R$ 89 por vida e pergunte quantos funcionários tem
4. Após saber o número de vidas/funcionários: diga que pode montar uma proposta personalizada e pergunte se pode ligar agora ou marcar para outro horário
5. Se aceitar ligação: confirme e inclua [LEAD_QUENTE] no final
6. Se pedir para ligar depois: pergunte qual o melhor horário e inclua [LEAD_QUENTE] no final
7. Se recusar definitivamente após 3 tentativas: agradeça e inclua [LEAD_FRIO] no final
8. NUNCA desista antes de tentar pelo menos 3 vezes de formas diferentes

EXEMPLOS DE ABORDAGEM QUANDO RECUSAR:
- "Entendo! Mas são só 5 minutinhos, vale muito a pena 😊 Consigo te ligar agora?"
- "Sem problema! Posso mandar uma proposta por aqui mesmo, sem compromisso?"
- "Tudo bem! Qual seria o melhor horário para você?"

CLASSIFICAÇÃO:
- Quando aceitar conversar com o consultor: inclua [LEAD_QUENTE] no final
- Quando recusar definitivamente: inclua [LEAD_FRIO] no final

Você representa: Rodrigo Monteiro — Especialista em Planos de Saúde Empresariais`;
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
const tipo = body.type || body.event;
console.log('Z-API body completo:', JSON.stringify(body).slice(0, 500));
    if (tipo !== 'ReceivedCallback' && tipo !== 'message') {
      return res.status(200).json({ ok: true });
    }

    const phone    = body.phone || (body.from && body.from.replace('@s.whatsapp.net','').replace('@c.us',''));
    const mensagem = body.text?.message || body.body || body.message || '';
    const fromMe   = body.fromMe || false;

    if (!phone || !mensagem || fromMe) {
      return res.status(200).json({ ok: true });
    }

    const histRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sdr_conversas?phone=eq.${phone}&order=created_at.asc&limit=20`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const historico = histRes.ok ? (await histRes.json()) : [];

    const messages = historico.map(h => ({ role: h.role, content: h.content }));
    messages.push({ role: 'user', content: mensagem });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, system: SDR_SYSTEM, messages: messages })
    });
const claudeData = await claudeRes.json();
    let resposta = claudeData.content?.[0]?.text || 'Obrigado pela mensagem! Em breve nosso consultor entrará em contato.';

    const isQuente = resposta.includes('[LEAD_QUENTE]');
    const isFrio   = resposta.includes('[LEAD_FRIO]');
    resposta = resposta.replace('[LEAD_QUENTE]', '').replace('[LEAD_FRIO]', '').trim();

    await fetch(`${SUPABASE_URL}/rest/v1/sdr_conversas`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, role: 'user', content: mensagem, created_at: new Date().toISOString() })
    });
    await fetch(`${SUPABASE_URL}/rest/v1/sdr_conversas`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, role: 'assistant', content: resposta, created_at: new Date().toISOString() })
    });

    await fetch(`${ZAPI_URL}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': 'F74077534357d405ca497b01736c52b96S' },
      body: JSON.stringify({ phone: phone, message: resposta })
    });

    if (isQuente && TWILIO_SID) {
      let toNumber = phone.replace(/[^0-9]/g, '');
      if (toNumber.length <= 11) toNumber = '+55' + toNumber;
      else if (!toNumber.startsWith('+')) toNumber = '+' + toNumber;

      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="pt-BR">Conectando com o consultor da Veracity Seguros.</Say></Response>`;
      const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: toNumber, From: TWILIO_FROM, Twiml: twiml })
      });

      await fetch(`${SUPABASE_URL}/rest/v1/sdr_leads?phone=eq.${phone}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'quente', updated_at: new Date().toISOString() })
      });
    }

    if (isFrio) {
      await fetch(`${SUPABASE_URL}/rest/v1/sdr_leads?phone=eq.${phone}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'frio', updated_at: new Date().toISOString() })
      });
    }

    return res.status(200).json({ ok: true, resposta, isQuente, isFrio });

  } catch(e) {
    console.error('Erro zapi-webhook:', e);
    return res.status(200).json({ ok: true });
  }
}
