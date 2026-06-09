export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

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
  const MEU_WHATSAPP  = '5521973855107';

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // ── FOLLOW-UP ──────────────────────────────────────────────────────────
    if (req.method === 'GET' || body.action === 'followup') {
      var agora2 = new Date();
      var horaBrasilia2 = agora2.getUTCHours() - 3;
      if (horaBrasilia2 < 0) horaBrasilia2 += 24;
      if (horaBrasilia2 < 9 || horaBrasilia2 >= 18) {
        return res.status(200).json({ ok: true, msg: 'Fora do horario comercial', hora: horaBrasilia2 });
      }
      var MSGS_FU = {
        1: 'Oi! Passei por aqui ontem mas nao vi sua resposta. Ainda tenho aquela condicao especial de Copa em planos de saude empresarial para voce. Vale a pena conhecer!',
        2: 'Ultima chance! Nossa condicao especial de Copa encerra essa semana — primeira mensalidade por nossa conta para empresas ate 99 vidas. Posso te apresentar as opcoes?'
      };
      await fetch(SUPABASE_URL + '/rest/v1/rpc/agendar_followups', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      var fuRes = await fetch(SUPABASE_URL + '/rest/v1/sdr_followup?enviado=eq.false&select=*&order=created_at.asc&limit=50', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      var followups = fuRes.ok ? (await fuRes.json()) : [];
      var enviadosFU = 0;
      for (var fi = 0; fi < followups.length; fi++) {
        var fu = followups[fi];
        var msgFU = MSGS_FU[fu.tentativa] || MSGS_FU[1];
        var telFU = fu.phone.replace(/[^0-9]/g, '');
        var telFullFU = telFU.startsWith('55') ? telFU : '55' + telFU;
        var zFU = await fetch(ZAPI_URL + '/send-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
          body: JSON.stringify({ phone: telFullFU, message: msgFU })
        });
        var zFUData = await zFU.json();
        if (zFU.ok && !zFUData.error) {
          enviadosFU++;
          await fetch(SUPABASE_URL + '/rest/v1/sdr_followup?id=eq.' + fu.id, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ enviado: true, enviado_em: new Date().toISOString() })
          });
        }
        if (fi < followups.length - 1) await new Promise(function(r) { setTimeout(r, 30000); });
      }
      return res.status(200).json({ ok: true, enviados: enviadosFU, total: followups.length });
    }

    // ── SDR IA ─────────────────────────────────────────────────────────────
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

    if (phone === MEU_WHATSAPP || phone === '21973855107') {
      return res.status(200).json({ ok: true });
    }

    // Busca nome da empresa do lead
    var nomeEmpresa = '';
    var leadRes = await fetch(
      SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone + '&select=empresa&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    if (leadRes.ok) {
      var leads = await leadRes.json();
      if (leads && leads[0] && leads[0].empresa) {
        nomeEmpresa = leads[0].empresa;
      }
    }

    const SDR_SYSTEM = 'Voce e um assistente de vendas da Veracity Seguros, especializada em planos de saude empresarial no Rio de Janeiro.\n\nSeu objetivo e qualificar leads e confirmar se o cliente pode atender uma ligacao AGORA.\n\nNOME DA EMPRESA DO LEAD: ' + (nomeEmpresa || 'a empresa') + '\n\nREGRAS:\n- Seja natural, curto e direto. Maximo 2 frases por mensagem.\n- Nunca diga que e uma IA\n- Use linguagem informal mas profissional\n- Nunca mande listas ou textos longos\n- Use emojis com moderacao\n- NUNCA encerre sem tentar pelo menos 3 vezes\n- NUNCA mencione uma operadora especifica. Fale apenas "plano de saude empresarial"\n\nFLUXO OBRIGATORIO:\n1. Primeira resposta do lead: pergunte "Que bom! Falo com o responsavel da ' + (nomeEmpresa || 'empresa') + '?"\n2. Se confirmar que e o responsavel: "Perfeito! Tenho uma condicao especial esse mes de Copa em planos de saude empresarial. Voce e sua familia ja tem plano hoje?"\n3. Se disser que NAO e o responsavel: "Entendo! Tem como me passar o contato do responsavel?"\n4. Se TEM plano: "Esta satisfeito com o valor que paga hoje?"\n5. Se NAO esta satisfeito ou NAO tem plano: "Esse mes estamos com a primeira mensalidade por nossa conta para empresas ate 99 vidas. Posso pedir para nosso consultor te ligar agora? Sao so 5 minutinhos!"\n6. Se disser SIM pode ligar AGORA: "Otimo! Em instantes voce recebera a ligacao do nosso consultor!" e inclua [LEAD_QUENTE]\n7. Se pedir para ligar DEPOIS: "Anotado! Qual o melhor horario para te ligar?" e quando informar diga "Perfeito! Rodrigo te liga as [horario]." e inclua [LEAD_AGENDADO:horario]\n8. Se recusar 1a vez: "Entendo! Mas sao so 5 minutinhos e pode fazer diferenca no seu bolso. Posso pedir para ligar agora?"\n9. Se recusar 2a vez: "Sem problema! Posso te mandar uma proposta aqui mesmo sem compromisso?"\n10. Se recusar 3a vez: agradeca e inclua [LEAD_FRIO]\n\nCLASSIFICACAO:\n- Confirmar ligacao AGORA: inclua [LEAD_QUENTE]\n- Agendar para depois: inclua [LEAD_AGENDADO:horario]\n- Recusar definitivamente: inclua [LEAD_FRIO]\n\nVoce representa: Rodrigo Monteiro - Especialista em Planos de Saude Empresariais';

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

    const isQuente   = resposta.includes('[LEAD_QUENTE]');
    const isFrio     = resposta.includes('[LEAD_FRIO]');
    const isAgendado = resposta.includes('[LEAD_AGENDADO');

    var horarioAgendado = '';
    if (isAgendado) {
      var match = resposta.match(/\[LEAD_AGENDADO:([^\]]+)\]/);
      if (match) horarioAgendado = match[1].trim();
    }

    resposta = resposta
      .replace('[LEAD_QUENTE]', '')
      .replace('[LEAD_FRIO]', '')
      .replace(/\[LEAD_AGENDADO:[^\]]*\]/, '')
      .trim();

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

    var agora = new Date();
    var horaBrasilia = agora.getUTCHours() - 3;
    if (horaBrasilia < 0) horaBrasilia += 24;
    var dentroDoHorario = horaBrasilia >= 9 && horaBrasilia < 18;

    if (isQuente && TWILIO_SID) {
      if (dentroDoHorario) {
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
        var historicoTexto = historico.slice(-4).map(function(h) {
          return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content;
        }).join('\n');
        var avisoMsg = '🔥 *LEAD QUENTE fora do horario!*\n\n*Numero:* ' + phone + '\n*Empresa:* ' + (nomeEmpresa || 'desconhecida') + '\n*Hora:* ' + agora.toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo'}) + '\n\n*Conversa:*\n' + historicoTexto + '\n\n📞 Ligue amanha as 09h!';
        await fetch(ZAPI_URL + '/send-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
          body: JSON.stringify({ phone: MEU_WHATSAPP, message: avisoMsg })
        });
      }
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'quente', updated_at: new Date().toISOString() })
      });
    }

    if (isAgendado) {
      var historicoTexto2 = historico.slice(-4).map(function(h) {
        return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content;
      }).join('\n');
      var avisoAgendado = '📅 *LEAD AGENDADO!*\n\n*Numero:* ' + phone + '\n*Empresa:* ' + (nomeEmpresa || 'desconhecida') + '\n*Horario:* ' + (horarioAgendado || 'a confirmar') + '\n\n*Conversa:*\n' + historicoTexto2 + '\n\n⏰ Ligue no horario combinado!';
      await fetch(ZAPI_URL + '/send-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
        body: JSON.stringify({ phone: MEU_WHATSAPP, message: avisoAgendado })
      });
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'agendado', horario: horarioAgendado, updated_at: new Date().toISOString() })
      });
    }

    if (isFrio) {
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'frio', updated_at: new Date().toISOString() })
      });
    }

    return res.status(200).json({ ok: true, resposta, isQuente, isFrio, isAgendado });

  } catch(e) {
    console.error('Erro zapi-webhook:', e);
    return res.status(200).json({ ok: true });
  }
}
