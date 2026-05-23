export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID;
  const ZAPI_TOKEN    = process.env.ZAPI_TOKEN;
  const ZAPI_URL      = 'https://api.z-api.io/instances/' + ZAPI_INSTANCE + '/token/' + ZAPI_TOKEN;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL  = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
  const TWILIO_SID    = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM   = process.env.TWILIO_FROM_NUMBER;
  const CLIENT_TOKEN  = 'F74077534357d405ca497b01736c52b96S';

const SDR_SYSTEM = 'Voce e um assistente de vendas da Veracity Seguros, especializada em planos de saude empresariais no Rio de Janeiro.\n\nSeu objetivo e qualificar leads e marcar uma conversa com o consultor.\n\nREGRAS IMPORTANTES:\n- Seja natural, curto e direto. Maximo 2 frases por mensagem.\n- Nunca mencione que e uma IA\n- Use linguagem informal mas profissional\n- Nunca mande listas ou textos longos\n- Use emojis com moderacao\n- NUNCA encerre a conversa sem tentar marcar uma ligacao ou enviar proposta\n- NUNCA diga para o lead entrar em contato depois - voce que deve insistir\n\nFLUXO DE QUALIFICACAO:\n1. Quando confirmar que e o responsavel: pergunte se a empresa tem plano de saude\n2. Se TEM plano: pergunte quantas vidas tem na empresa\n3. Se NAO TEM plano: diga que tem opcoes excelentes e pergunte quantos funcionarios tem\n4. Apos saber o numero de vidas: diga que pode montar uma proposta e pergunte se pode ligar agora\n5. Se disser que nao tem interesse ainda: diga que entende e pergunte se pode enviar uma proposta rapida por aqui mesmo sem compromisso\n6. Se disser que vai pensar: pergunte qual o melhor horario para ligar e confirme\n7. Se aceitar ligacao ou horario: confirme e inclua [LEAD_QUENTE] no final\n8. Se recusar definitivamente apos 3 tentativas: agradeca e inclua [LEAD_FRIO] no final\n9. NUNCA desista antes de tentar pelo menos 3 vezes de formas diferentes\n\nEXEMPLOS QUANDO RECUSAR:\n- Entendo! Mas sao so 5 minutinhos, vale muito a pena! Consigo te ligar agora?\n- Sem problema! Posso mandar uma proposta rapida por aqui mesmo, sem compromisso?\n- Tudo bem! Qual seria o melhor horario para voce amanha?\n\nCLASSIFICACAO:\n- Quando aceitar conversar com o consultor: inclua [LEAD_QUENTE] no final\n- Quando recusar definitivamente: inclua [LEAD_FRIO] no final\n\nVoce representa: Rodrigo Monteiro - Especialista em Planos de Saude Empresariais';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const tipo = body.type || body.event;

    if (tipo !== 'ReceivedCallback' && tipo !== 'message') {
      return res.status(200).json({ ok: true });
    }

    const phone    = body.phone || (body.from && body.from.replace('@s.whatsapp.net','').replace('@c.us',''));
    const mensagem = (body.text && body.text.message) || body.body || body.message || '';
    const fromMe   = body.fromMe || false;

    if (!phone || !mensagem || fromMe) {
      return res.status(200).json({ ok: true });
    }

    const histRes = await fetch(
      SUPABASE_URL + '/rest/v1/sdr_conversas?phone=eq.' + phone + '&order=created_at.asc&limit=20',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    const historico = histRes.ok ? (await histRes.json()) : [];

    const messages = historico.map(function(h) { return { role: h.role, content: h.content }; });
    messages.push({ role: 'user', content: mensagem });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, system: SDR_SYSTEM, messages: messages })
    });

    const claudeData = await claudeRes.json();
    var resposta = (claudeData.content && claudeData.content[0] && claudeData.content[0].text) || 'Obrigado! Em breve nosso consultor entrara em contato.';

    const isQuente = resposta.includes('[LEAD_QUENTE]');
    const isFrio   = resposta.includes('[LEAD_FRIO]');
    resposta = resposta.replace('[LEAD_QUENTE]', '').replace('[LEAD_FRIO]', '').trim();

    await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, role: 'user', content: mensagem, created_at: new Date().toISOString() })
    });

    await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, role: 'assistant', content: resposta, created_at: new Date().toISOString() })
    });

    await fetch(ZAPI_URL + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: phone, message: resposta })
    });

    if (isQuente && TWILIO_SID) {
      var toNumber = phone.replace(/[^0-9]/g, '');
      if (toNumber.length <= 11) toNumber = '+55' + toNumber;
      else if (toNumber.charAt(0) !== '+') toNumber = '+' + toNumber;

      var twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="pt-BR">Conectando com o consultor da Veracity Seguros.</Say></Response>';
      var auth = Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64');

      await fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_SID + '/Calls.json', {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: toNumber, From: TWILIO_FROM, Twiml: twiml })
      });

      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'quente', updated_at: new Date().toISOString() })
      });
    }

    if (isFrio) {
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'frio', updated_at: new Date().toISOString() })
      });
    }

    return res.status(200).json({ ok: true, resposta: resposta, isQuente: isQuente, isFrio: isFrio });

  } catch(e) {
    console.error('Erro zapi-webhook:', e);
    return res.status(200).json({ ok: true });
  }
}
