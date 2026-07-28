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
  const CLIENT_TOKEN  = 'F74077534357d405ca497b01736c52b96S';
  const MEU_WHATSAPP  = '5521973855107';

  // Cache em memória para evitar duplicatas (messageId)
  const _processados = global._msgProcessados = global._msgProcessados || {};

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  async function enviarMensagem(phone, mensagem) {
    var telLimpo = phone.replace(/[^0-9]/g, '');
    if (!telLimpo.startsWith('55')) telLimpo = '55' + telLimpo;
    await sleep(1000); // delay mínimo entre envios
    return fetch(ZAPI_URL + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: telLimpo, message: mensagem })
    });
  }

  async function distribuirLead(phone, nomeCliente, dadosLead, historicoTexto) {
    var corrRes = await fetch(
      SUPABASE_URL + '/rest/v1/corretores?disponivel=eq.true&order=ultimo_lead_em.asc.nullsfirst&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    var corretores = corrRes.ok ? (await corrRes.json()) : [];
    if (!corretores.length) {
      await enviarMensagem(MEU_WHATSAPP,
        'LEAD QUENTE — NENHUM CORRETOR DISPONIVEL!\n\nNome: ' + nomeCliente + '\nNumero: ' + phone + '\nCNPJ: ' + (dadosLead.cnpj || 'nao informado') + '\nTipo: ' + (dadosLead.tipo || '-') + '\nBeneficio: ' + (dadosLead.beneficio || '-') + '\n\nConversa:\n' + historicoTexto + '\n\nAssuma esse atendimento ou ative algum corretor.'
      );
      return null;
    }
    var corretor = corretores[0];
    await fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_phone: phone, lead_empresa: dadosLead.cnpj || '', corretor_id: corretor.id, status: 'aguardando_resposta' })
    });
    await fetch(SUPABASE_URL + '/rest/v1/corretores?id=eq.' + corretor.id, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ultimo_lead_em: new Date().toISOString(), total_leads_recebidos: (corretor.total_leads_recebidos || 0) + 1 })
    });
    var telLimpo = phone.replace(/[^0-9]/g, '');
    var linkPronto = 'https://wa.me/' + (telLimpo.startsWith('55') ? telLimpo : '55' + telLimpo);
    await enviarMensagem(corretor.whatsapp,
      'NOVO LEAD QUENTE!\n\nNome: ' + nomeCliente + '\nNumero: ' + phone + '\nCNPJ: ' + (dadosLead.cnpj || 'nao informado') + '\nPlano atual: ' + (dadosLead.planoAtual || 'nao informado') + '\nTipo: ' + (dadosLead.tipo || '-') + '\nBeneficio: ' + (dadosLead.beneficio || '-') + '\n\nConversa:\n' + historicoTexto + '\n\nAbrir conversa: ' + linkPronto + '\n\nVoce tem 30 minutos para responder.'
    );
    return { corretor: corretor.nome };
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // REDISTRIBUICAO TIMEOUT
    if (body.action === 'redistribuir_timeout') {
      var limite = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      var pendRes = await fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos?status=eq.aguardando_resposta&distribuido_em=lt.' + limite + '&select=*', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
      var pendentes = pendRes.ok ? (await pendRes.json()) : [];
      var redistribuidos = 0;
      for (var pi = 0; pi < pendentes.length; pi++) {
        var p = pendentes[pi];
        await fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos?id=eq.' + p.id, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'expirado_sem_resposta' }) });
        var histR = await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas?phone=eq.' + p.lead_phone + '&order=created_at.asc&limit=10', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
        var histArr = histR.ok ? (await histR.json()) : [];
        var histTxt = histArr.slice(-6).map(function(h) { return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content; }).join('\n');
        var resultado = await distribuirLead(p.lead_phone, p.lead_phone, { cnpj: p.lead_empresa }, histTxt);
        if (resultado) redistribuidos++;
      }
      return res.status(200).json({ ok: true, redistribuidos: redistribuidos });
    }

    // FOLLOW-UP
    if (req.method === 'GET' || body.action === 'followup') {
      var agora = new Date();
      var horaBrasilia = agora.getUTCHours() - 3;
      if (horaBrasilia < 0) horaBrasilia += 24;
      if (horaBrasilia < 9 || horaBrasilia >= 18) return res.status(200).json({ ok: true, msg: 'Fora do horario comercial' });
      var fuRes = await fetch(SUPABASE_URL + '/rest/v1/sdr_followup?enviado=eq.false&select=*&order=created_at.asc&limit=50', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
      var followups = fuRes.ok ? (await fuRes.json()) : [];
      var MSGS_FU = {
        1: 'Ola! Passei por aqui anteriormente mas nao vi sua resposta. Ainda podemos realizar uma analise gratuita do seu plano de saude empresarial. Tem interesse?',
        2: 'Ultima tentativa de contato. Nossa analise gratuita para plano de saude empresarial esta disponivel. Posso te apresentar as opcoes?'
      };
      var enviadosFU = 0;
      for (var fi = 0; fi < followups.length; fi++) {
        var fu = followups[fi];
        var zFU = await enviarMensagem(fu.phone, MSGS_FU[fu.tentativa] || MSGS_FU[1]);
        var zFUData = await zFU.json();
        if (zFU.ok && !zFUData.error) {
          enviadosFU++;
          await fetch(SUPABASE_URL + '/rest/v1/sdr_followup?id=eq.' + fu.id, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ enviado: true, enviado_em: new Date().toISOString() }) });
        }
        if (fi < followups.length - 1) await sleep(30000);
      }
      return res.status(200).json({ ok: true, enviados: enviadosFU });
    }

    // WEBHOOK PRINCIPAL
    const messageId = body.messageId || '';
    const fromMe    = body.fromMe || false;
    const phone     = body.phone || (body.from && body.from.replace('@s.whatsapp.net', '').replace('@c.us', '')) || '';
    const mensagem  = (body.text && body.text.message) || (body.text && typeof body.text === 'string' && body.text) || body.body || body.message || '';

    // ANTI-DUPLICATA: ignora se já processamos esse messageId
    if (messageId && _processados[messageId]) {
      console.log('DUPLICATA IGNORADA:', messageId);
      return res.status(200).json({ ok: true, motivo: 'duplicata' });
    }
    if (messageId) {
      _processados[messageId] = Date.now();
      // Limpa cache antigo (> 5 min)
      var agora2 = Date.now();
      Object.keys(_processados).forEach(function(k) { if (agora2 - _processados[k] > 300000) delete _processados[k]; });
    }

    if (!phone || !mensagem || fromMe) return res.status(200).json({ ok: true, motivo: 'sem_dados' });

    // Ignora meu numero
    var phoneLimpo = phone.replace(/[^0-9]/g, '').replace(/^55/, '');
    if (phoneLimpo === '21973855107') return res.status(200).json({ ok: true, motivo: 'meu_numero' });

    // Ignora corretores
    var corrCheckRes = await fetch(SUPABASE_URL + '/rest/v1/corretores?whatsapp=eq.' + phone + '&select=id', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
    var corrCheck = corrCheckRes.ok ? (await corrCheckRes.json()) : [];
    if (corrCheck.length > 0) return res.status(200).json({ ok: true, motivo: 'corretor' });

    // Busca dados do lead
    var leadRes = await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone + '&select=*&limit=1', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
    var leads = leadRes.ok ? (await leadRes.json()) : [];
    var leadData = leads[0] || {};

    var nomeCliente  = leadData.nome || '';
    var cnpjLead     = leadData.empresa || '';
    var beneficioLead = leadData.horario || '';
    var planoAtualLead = '';
    var tipoLead = '';

    if (!nomeCliente && mensagem.includes('Meu nome e')) { var mn = mensagem.match(/Meu nome e ([^\n.]+)/); if (mn) nomeCliente = mn[1].trim(); }
    if (!cnpjLead && mensagem.includes('CNPJ:')) { var mc = mensagem.match(/CNPJ:\s*([^\n]+)/); if (mc) cnpjLead = mc[1].trim(); }
    if (mensagem.includes('Plano atual:')) { var mp = mensagem.match(/Plano atual:\s*([^\n]+)/); if (mp) planoAtualLead = mp[1].trim(); }
    if (mensagem.includes('Tipo de plano desejado:')) { var mt = mensagem.match(/Tipo de plano desejado:\s*([^\n]+)/); if (mt) tipoLead = mt[1].trim(); }
    if (!beneficioLead && mensagem.includes('Beneficio desejado:')) { var mb = mensagem.match(/Beneficio desejado:\s*([^\n]+)/); if (mb) beneficioLead = mb[1].trim(); }

    var primeiroNome = nomeCliente ? nomeCliente.split(' ')[0] : '';

    // Historico de conversas
    const histRes = await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas?phone=eq.' + phone + '&order=created_at.asc&limit=20', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
    const historico = histRes.ok ? (await histRes.json()) : [];

    const SDR_SYSTEM = `Voce e Estevao, especialista em planos de saude empresarial da Veracity Seguros, no Rio de Janeiro.

DADOS DO CLIENTE:
- Nome: ${nomeCliente || 'nao identificado'}
- CNPJ: ${cnpjLead || 'nao informado'}
- Plano atual: ${planoAtualLead || 'nao informado'}
- Tipo desejado: ${tipoLead || 'nao informado'}
- Beneficio desejado: ${beneficioLead || 'nao informado'}
- Primeiro nome: ${primeiroNome || 'cliente'}

REGRAS:
- NUNCA use emojis
- NUNCA diga que e uma IA
- Natural, direto e profissional
- Maximo 2 frases por mensagem
- NUNCA encerre sem tentar 3 vezes

FLUXO:

ETAPA 1 — Primeira msg com dados do site:
Responda APENAS: "Ola, ${primeiroNome || 'tudo bem'}! Aqui e o Estevao da Veracity Seguros. Recebi seu cadastro e vou verificar a elegibilidade do seu CNPJ agora."
E inclua a tag: [VERIFICAR_CNPJ]

ETAPA 2 — Apos verificacao (cliente confirma interesse):
Se cliente disse SIM ou confirmou: [LEAD_QUENTE]
Se cliente disse NAO: tente mais 2 vezes antes de [LEAD_FRIO]

ETAPA 3 — Msg generica sem dados:
"Ola! Aqui e o Estevao da Veracity Seguros. Estou entrando em contato para uma analise gratuita de plano de saude empresarial. Sua empresa possui CNPJ ativo?"
Se sim → pede CNPJ → ETAPA 2
Se nao → [LEAD_FRIO]

TAGS:
[LEAD_QUENTE] = cliente quer atendimento
[LEAD_AGENDADO:horario] = agendou ligacao
[LEAD_FRIO] = recusou definitivamente
[VERIFICAR_CNPJ] = verificar elegibilidade com delay`;

    const messages = historico.map(function(h) { return { role: h.role, content: h.content }; });
    messages.push({ role: 'user', content: mensagem });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 300, system: SDR_SYSTEM, messages: messages })
    });

    const claudeData = await claudeRes.json();
    var resposta = (claudeData.content && claudeData.content[0] && claudeData.content[0].text) || 'Obrigado! Em breve nosso especialista entrara em contato.';

    const isQuente    = resposta.includes('[LEAD_QUENTE]');
    const isFrio      = resposta.includes('[LEAD_FRIO]');
    const isAgendado  = resposta.includes('[LEAD_AGENDADO');
    const isVerificar = resposta.includes('[VERIFICAR_CNPJ]');

    var horarioAgendado = '';
    if (isAgendado) { var matchAg = resposta.match(/\[LEAD_AGENDADO:([^\]]+)\]/); if (matchAg) horarioAgendado = matchAg[1].trim(); }

    resposta = resposta.replace('[LEAD_QUENTE]', '').replace('[LEAD_FRIO]', '').replace('[VERIFICAR_CNPJ]', '').replace(/\[LEAD_AGENDADO:[^\]]*\]/, '').trim();

    // Salva msg do cliente
    await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, role: 'user', content: mensagem, created_at: new Date().toISOString() })
    });

    // Envia resposta com delay de 3 segundos
    await sleep(3000);
    await enviarMensagem(phone, resposta);

    // Salva resposta do SDR
    await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, role: 'assistant', content: resposta, created_at: new Date().toISOString() })
    });

    // VERIFICAR CNPJ — delay 10s e envia elegibilidade
    if (isVerificar) {
      await sleep(10000);
      var msgElegivel = 'Otima noticia, ' + (primeiroNome || '') + '! O CNPJ informado esta elegivel para o beneficio de ' + (beneficioLead || 'primeira mensalidade') + ' gratuita. Nosso especialista pode te apresentar as melhores opcoes agora. Posso conecta-lo?';
      await enviarMensagem(phone, msgElegivel);
      await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, role: 'assistant', content: msgElegivel, created_at: new Date().toISOString() })
      });
    }

    // LEAD QUENTE
    if (isQuente) {
      var histTexto = historico.slice(-8).map(function(h) { return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content; }).join('\n');
      await distribuirLead(phone, nomeCliente, { cnpj: cnpjLead, planoAtual: planoAtualLead, tipo: tipoLead, beneficio: beneficioLead }, histTexto);
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'quente', updated_at: new Date().toISOString() }) });
    }

    // LEAD AGENDADO
    if (isAgendado) {
      await enviarMensagem(MEU_WHATSAPP, 'LEAD AGENDADO!\n\nNome: ' + nomeCliente + '\nNumero: ' + phone + '\nCNPJ: ' + cnpjLead + '\nHorario: ' + (horarioAgendado || 'a confirmar'));
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'agendado', horario: horarioAgendado, updated_at: new Date().toISOString() }) });
    }

    // LEAD FRIO
    if (isFrio) {
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'frio', updated_at: new Date().toISOString() }) });
    }

    return res.status(200).json({ ok: true, resposta, isQuente, isFrio, isAgendado, isVerificar });

  } catch(e) {
    console.error('Erro zapi-webhook:', e);
    return res.status(200).json({ ok: true, erro: e.message });
  }
}
