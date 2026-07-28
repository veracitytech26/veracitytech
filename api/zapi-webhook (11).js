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

  // ── ENVIA MENSAGEM VIA Z-API ──────────────────────────────────────────────
  async function enviarMensagem(phone, mensagem) {
    var telLimpo = phone.replace(/[^0-9]/g, '');
    if (!telLimpo.startsWith('55')) telLimpo = '55' + telLimpo;
    return fetch(ZAPI_URL + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: telLimpo, message: mensagem })
    });
  }

  // ── DISTRIBUI LEAD PARA CORRETOR DISPONIVEL ───────────────────────────────
  async function distribuirLead(phone, nomeCliente, dadosLead, historicoTexto) {
    var corrRes = await fetch(
      SUPABASE_URL + '/rest/v1/corretores?disponivel=eq.true&order=ultimo_lead_em.asc.nullsfirst&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    var corretores = corrRes.ok ? (await corrRes.json()) : [];

    if (!corretores.length) {
      await enviarMensagem(MEU_WHATSAPP,
        'LEAD QUENTE — NENHUM CORRETOR DISPONIVEL!\n\n'
        + 'Nome: ' + nomeCliente + '\n'
        + 'Numero: ' + phone + '\n'
        + 'CNPJ: ' + (dadosLead.cnpj || 'nao informado') + '\n'
        + 'Tipo: ' + (dadosLead.tipo || '-') + '\n'
        + 'Beneficio: ' + (dadosLead.beneficio || '-') + '\n\n'
        + 'Conversa:\n' + historicoTexto + '\n\n'
        + 'Assuma esse atendimento ou ative algum corretor.'
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
      'NOVO LEAD QUENTE PARA VOCE!\n\n'
      + 'Nome: ' + nomeCliente + '\n'
      + 'Numero: ' + phone + '\n'
      + 'CNPJ: ' + (dadosLead.cnpj || 'nao informado') + '\n'
      + 'Plano atual: ' + (dadosLead.planoAtual || 'nao informado') + '\n'
      + 'Tipo desejado: ' + (dadosLead.tipo || '-') + '\n'
      + 'Beneficio: ' + (dadosLead.beneficio || '-') + '\n\n'
      + 'Conversa com SDR:\n' + historicoTexto + '\n\n'
      + 'Clique para abrir: ' + linkPronto + '\n\n'
      + 'Voce tem 30 minutos para responder.'
    );

    return { corretor: corretor.nome };
  }

  // ── REDISTRIBUICAO TIMEOUT ─────────────────────────────────────────────────
  if ((req.body && req.body.action === 'redistribuir_timeout') || (typeof req.body === 'string' && JSON.parse(req.body).action === 'redistribuir_timeout')) {
    var body0 = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    var limite = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    var pendRes = await fetch(
      SUPABASE_URL + '/rest/v1/leads_distribuidos?status=eq.aguardando_resposta&distribuido_em=lt.' + limite + '&select=*',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    var pendentes = pendRes.ok ? (await pendRes.json()) : [];
    var redistribuidos = 0;
    for (var pi = 0; pi < pendentes.length; pi++) {
      var p = pendentes[pi];
      await fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos?id=eq.' + p.id, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'expirado_sem_resposta' })
      });
      var histR = await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas?phone=eq.' + p.lead_phone + '&order=created_at.asc&limit=10', {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      });
      var histArr = histR.ok ? (await histR.json()) : [];
      var histTxt = histArr.slice(-6).map(function(h) { return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content; }).join('\n');
      var resultado = await distribuirLead(p.lead_phone, p.lead_phone, {cnpj: p.lead_empresa}, histTxt);
      if (resultado) redistribuidos++;
    }
    return res.status(200).json({ ok: true, redistribuidos: redistribuidos });
  }

  // ── FOLLOW-UP ──────────────────────────────────────────────────────────────
  if (req.method === 'GET' || (req.body && req.body.action === 'followup')) {
    var agora = new Date();
    var horaBrasilia = agora.getUTCHours() - 3;
    if (horaBrasilia < 0) horaBrasilia += 24;
    if (horaBrasilia < 9 || horaBrasilia >= 18) {
      return res.status(200).json({ ok: true, msg: 'Fora do horario comercial' });
    }
    var fuRes = await fetch(SUPABASE_URL + '/rest/v1/sdr_followup?enviado=eq.false&select=*&order=created_at.asc&limit=50', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    var followups = fuRes.ok ? (await fuRes.json()) : [];
    var MSGS_FU = {
      1: 'Ola! Passei por aqui anteriormente mas nao vi sua resposta. Ainda podemos realizar uma analise gratuita do seu plano de saude empresarial. Tem interesse?',
      2: 'Ultima tentativa de contato. Nossa analise gratuita para plano de saude empresarial esta disponivel. Posso te apresentar as opcoes?'
    };
    var enviadosFU = 0;
    for (var fi = 0; fi < followups.length; fi++) {
      var fu = followups[fi];
      var msgFU = MSGS_FU[fu.tentativa] || MSGS_FU[1];
      var zFU = await enviarMensagem(fu.phone, msgFU);
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
    return res.status(200).json({ ok: true, enviados: enviadosFU });
  }

  // ── WEBHOOK PRINCIPAL ──────────────────────────────────────────────────────
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const tipo = body.type || body.event;
    if (tipo !== 'ReceivedCallback' && tipo !== 'message') {
      return res.status(200).json({ ok: true });
    }

    const phone    = body.phone || (body.from && body.from.replace('@s.whatsapp.net','').replace('@c.us',''));
    const mensagem = (body.text && body.text.message) || body.body || body.message || '';
    const fromMe   = body.fromMe || false;

    if (!phone || !mensagem || fromMe) return res.status(200).json({ ok: true });
    if (phone === MEU_WHATSAPP || phone === '21973855107') return res.status(200).json({ ok: true });

    // Ignora mensagens de corretores
    var corrCheckRes = await fetch(SUPABASE_URL + '/rest/v1/corretores?whatsapp=eq.' + phone + '&select=id', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    var corrCheck = corrCheckRes.ok ? (await corrCheckRes.json()) : [];
    if (corrCheck.length > 0) return res.status(200).json({ ok: true });

    // Busca dados do lead no Supabase (vem da landing page)
    var leadRes = await fetch(
      SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone + '&select=*&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    var leads = leadRes.ok ? (await leadRes.json()) : [];
    var leadData = leads[0] || {};

    // Extrai dados da mensagem inicial (vinda da landing page)
    var nomeCliente = leadData.nome || '';
    var cnpjLead = leadData.empresa || '';
    var planoAtualLead = '';
    var tipoLead = '';
    var beneficioLead = leadData.horario || '';

    // Tenta extrair dados da mensagem inicial se ainda não estão no banco
    if (!nomeCliente && mensagem.includes('Meu nome e')) {
      var matchNome = mensagem.match(/Meu nome e ([^\n.]+)/);
      if (matchNome) nomeCliente = matchNome[1].trim();
    }
    if (!cnpjLead && mensagem.includes('CNPJ:')) {
      var matchCNPJ = mensagem.match(/CNPJ:\s*([^\n]+)/);
      if (matchCNPJ) cnpjLead = matchCNPJ[1].trim();
    }
    if (mensagem.includes('Plano atual:')) {
      var matchPlano = mensagem.match(/Plano atual:\s*([^\n]+)/);
      if (matchPlano) planoAtualLead = matchPlano[1].trim();
    }
    if (mensagem.includes('Tipo de plano desejado:')) {
      var matchTipo = mensagem.match(/Tipo de plano desejado:\s*([^\n]+)/);
      if (matchTipo) tipoLead = matchTipo[1].trim();
    }
    if (!beneficioLead && mensagem.includes('Beneficio desejado:')) {
      var matchBeneficio = mensagem.match(/Beneficio desejado:\s*([^\n]+)/);
      if (matchBeneficio) beneficioLead = matchBeneficio[1].trim();
    }

    var primeiroNome = nomeCliente ? nomeCliente.split(' ')[0] : '';

    // Busca historico de conversas
    const histRes = await fetch(
      SUPABASE_URL + '/rest/v1/sdr_conversas?phone=eq.' + phone + '&order=created_at.asc&limit=20',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    const historico = histRes.ok ? (await histRes.json()) : [];
    const isFirstMessage = historico.length === 0;

    // SISTEMA DO SDR IA
    const SDR_SYSTEM = `Voce e Estevao, especialista em planos de saude empresarial da Veracity Seguros, no Rio de Janeiro.

DADOS DO CLIENTE (vieram do site):
- Nome: ${nomeCliente || 'nao identificado'}
- CNPJ: ${cnpjLead || 'nao informado'}
- Plano atual: ${planoAtualLead || 'nao informado'}
- Tipo de plano desejado: ${tipoLead || 'nao informado'}
- Beneficio desejado: ${beneficioLead || 'nao informado'}
- Primeiro nome: ${primeiroNome || 'cliente'}

REGRAS ABSOLUTAS:
- NUNCA use emojis
- NUNCA diga que e uma IA
- Seja natural, direto e profissional
- Maximo 3 frases por mensagem
- NUNCA mencione operadoras especificas antes de o cliente mencionar
- NUNCA encerre sem tentar pelo menos 3 vezes

FLUXO OBRIGATORIO — siga essa ordem exata:

ETAPA 1 — PRIMEIRA MENSAGEM DO CLIENTE (vinda do site):
Se a mensagem tiver dados do formulario (CNPJ, nome, etc), responda:
"Ola, ${primeiroNome || 'tudo bem'}! Aqui e o Estevao da Veracity Seguros. Recebi seu cadastro e vou verificar a elegibilidade do seu CNPJ agora."
Depois aguarde 10 segundos e envie: [VERIFICAR_CNPJ]

ETAPA 2 — APOS VERIFICAR CNPJ (sempre positivo):
"Otima noticia! O CNPJ informado esta elegivel para o beneficio de ${beneficioLead || 'primeira mensalidade'} gratuita no plano de saude empresarial. Nosso especialista pode te apresentar as melhores opcoes agora. Posso conecta-lo?"
Se confirmar: [LEAD_QUENTE]
Se negar: tente mais 2 vezes antes de [LEAD_FRIO]

ETAPA 3 — SE CLIENTE VEIO SEM DADOS DO FORMULARIO (mensagem generica):
"Ola! Aqui e o Estevao da Veracity Seguros. Estou entrando em contato para apresentar uma analise gratuita de plano de saude empresarial. Sua empresa possui CNPJ ativo?"
Se sim: pede o CNPJ e segue para ETAPA 2
Se nao: [LEAD_FRIO]

CLASSIFICACAO:
- Cliente confirma atendimento com especialista: [LEAD_QUENTE]
- Cliente agenda ligacao: [LEAD_AGENDADO:horario]
- Cliente recusa definitivamente: [LEAD_FRIO]
- Verificar CNPJ (delay de 10s): [VERIFICAR_CNPJ]`;

    // Monta mensagens para Claude
    const messages = historico.map(function(h) { return { role: h.role, content: h.content }; });
    messages.push({ role: 'user', content: mensagem });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, system: SDR_SYSTEM, messages: messages })
    });

    const claudeData = await claudeRes.json();
    var resposta = (claudeData.content && claudeData.content[0] && claudeData.content[0].text) || 'Obrigado! Em breve nosso especialista entrara em contato.';

    const isQuente     = resposta.includes('[LEAD_QUENTE]');
    const isFrio       = resposta.includes('[LEAD_FRIO]');
    const isAgendado   = resposta.includes('[LEAD_AGENDADO');
    const isVerificar  = resposta.includes('[VERIFICAR_CNPJ]');

    var horarioAgendado = '';
    if (isAgendado) {
      var match = resposta.match(/\[LEAD_AGENDADO:([^\]]+)\]/);
      if (match) horarioAgendado = match[1].trim();
    }

    // Limpa tags da resposta
    resposta = resposta
      .replace('[LEAD_QUENTE]', '')
      .replace('[LEAD_FRIO]', '')
      .replace('[VERIFICAR_CNPJ]', '')
      .replace(/\[LEAD_AGENDADO:[^\]]*\]/, '')
      .trim();

    // Salva conversa
    await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, role: 'user', content: mensagem, created_at: new Date().toISOString() })
    });

    // Envia resposta inicial
    await enviarMensagem(phone, resposta);

    // SE VERIFICAR CNPJ — aguarda 10 segundos e envia confirmacao de elegibilidade
    if (isVerificar) {
      await new Promise(function(r) { setTimeout(r, 10000); });

      var msgElegivel = 'Otima noticia, ' + (primeiroNome || 'tudo certo') + '! O CNPJ informado esta elegivel para o beneficio de ' + (beneficioLead || 'primeira mensalidade') + ' gratuita no plano de saude empresarial. Nosso especialista pode te apresentar as melhores opcoes. Posso conecta-lo agora?';

      await enviarMensagem(phone, msgElegivel);

      await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, role: 'assistant', content: msgElegivel, created_at: new Date().toISOString() })
      });
    }

    // Salva resposta do SDR no historico
    await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, role: 'assistant', content: resposta, created_at: new Date().toISOString() })
    });

    // LEAD QUENTE — distribui para corretor
    if (isQuente) {
      var historicoTexto = historico.slice(-8).map(function(h) {
        return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content;
      }).join('\n');

      await distribuirLead(phone, nomeCliente, {
        cnpj: cnpjLead,
        planoAtual: planoAtualLead,
        tipo: tipoLead,
        beneficio: beneficioLead
      }, historicoTexto);

      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'quente', updated_at: new Date().toISOString() })
      });
    }

    // LEAD AGENDADO
    if (isAgendado) {
      await enviarMensagem(MEU_WHATSAPP,
        'LEAD AGENDADO!\n\nNome: ' + nomeCliente + '\nNumero: ' + phone + '\nCNPJ: ' + cnpjLead + '\nHorario: ' + (horarioAgendado || 'a confirmar') + '\n\nLigue no horario combinado!'
      );
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'agendado', horario: horarioAgendado, updated_at: new Date().toISOString() })
      });
    }

    // LEAD FRIO
    if (isFrio) {
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'frio', updated_at: new Date().toISOString() })
      });
    }

    return res.status(200).json({ ok: true, resposta, isQuente, isFrio, isAgendado, isVerificar });

  } catch(e) {
    console.error('Erro zapi-webhook:', e);
    return res.status(200).json({ ok: true });
  }
}
