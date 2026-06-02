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
  const MEU_WHATSAPP  = '5521973855107'; // Rodrigo — aviso de lead quente fora do horário

  const SDR_SYSTEM = 'Voce e um assistente de vendas da Veracity Seguros, especializada em planos de saude no Rio de Janeiro. Seu nome e Rodrigo.\n\nSeu objetivo e qualificar leads e conectar com o consultor.\n\nREGRAS:\n- Seja natural, curto e direto. Maximo 2 frases por mensagem.\n- Nunca diga que e uma IA\n- Use linguagem informal mas profissional\n- Nunca mande listas ou textos longos\n- Use emojis com moderacao\n- NUNCA encerre sem tentar pelo menos 3 vezes\n\nFLUXO:\n1. Quando o lead responder qualquer coisa: diga "Que bom! Tenho uma novidade especial esse mes de Copa. Voce e sua familia ja tem plano de saude hoje?"\n2. Se TEM plano: pergunte "Esta satisfeito com o valor que paga hoje?"\n3. Se NAO esta satisfeito ou NAO tem plano: diga "Esse mes estamos com condicao exclusiva no Bradesco — primeira mensalidade por nossa conta! Posso te apresentar as opcoes?"\n4. Se aceitar: diga que vai conectar com o consultor agora e inclua [LEAD_QUENTE]\n5. Se pedir para ligar depois: pergunte o melhor horario e inclua [LEAD_QUENTE]\n6. Se recusar 1a vez: "Entendo! Mas sao so 5 minutinhos e pode fazer diferenca no seu bolso. Consigo te ligar agora?"\n7. Se recusar 2a vez: "Sem problema! Posso te mandar uma proposta aqui mesmo sem compromisso?"\n8. Se recusar 3a vez: agradeca e inclua [LEAD_FRIO]\n\nCLASSIFICACAO:\n- Aceitar falar com consultor: inclua [LEAD_QUENTE]\n- Recusar definitivamente: inclua [LEAD_FRIO]\n\nVoce representa: Rodrigo Monteiro - Especialista em Planos de Saude';

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

    // Não responde para o próprio número do gestor
    if (phone === MEU_WHATSAPP || phone === '21973855107') {
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

    // Salva conversa
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

    // Envia resposta
    await fetch(ZAPI_URL + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: phone, message: resposta })
    });

    // Se LEAD QUENTE
    if (isQuente && TWILIO_SID) {
      // Verifica horário comercial (09h às 18h horário de Brasília)
      var agora = new Date();
      var horaBrasilia = agora.getUTCHours() - 3; // UTC-3
      if (horaBrasilia < 0) horaBrasilia += 24;
      var dentroDoHorario = horaBrasilia >= 9 && horaBrasilia < 18;

      if (dentroDoHorario) {
        // DISPARA LIGAÇÃO
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

      } else {
        // FORA DO HORÁRIO — avisa o Rodrigo no WhatsApp
        var historicoTexto = historico.slice(-4).map(function(h) {
          return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content;
        }).join('\n');

        var avisoMsg = '🔥 *LEAD QUENTE fora do horário!*\n\n'
          + '*Número:* ' + phone + '\n'
          + '*Hora:* ' + agora.toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo'}) + '\n\n'
          + '*Conversa:*\n' + historicoTexto + '\n\n'
          + '📞 Ligue amanhã às 09h!';

        await fetch(ZAPI_URL + '/send-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
          body: JSON.stringify({ phone: MEU_WHATSAPP, message: avisoMsg })
        });
      }

      // Atualiza status no Supabase
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
