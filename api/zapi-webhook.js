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

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  async function enviarMensagem(phone, mensagem) {
    var telLimpo = phone.replace(/[^0-9]/g, '');
    if (!telLimpo.startsWith('55')) telLimpo = '55' + telLimpo;
    await sleep(1000);
    return fetch(ZAPI_URL + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: telLimpo, message: mensagem })
    });
  }

  async function distribuirLead(phone, nomeCliente, dadosLead) {
    // Busca corretor disponivel (round-robin)
    var corrRes = await fetch(
      SUPABASE_URL + '/rest/v1/corretores?disponivel=eq.true&order=ultimo_lead_em.asc.nullsfirst&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    var corretores = corrRes.ok ? (await corrRes.json()) : [];

    if (!corretores.length) {
      await enviarMensagem(MEU_WHATSAPP,
        'LEAD QUENTE — NENHUM CORRETOR DISPONIVEL!\n\nNome: ' + nomeCliente + '\nNumero: ' + phone +
        '\nCNPJ: ' + (dadosLead.cnpj || '-') + '\nTipo: ' + (dadosLead.tipo || '-') +
        '\nBeneficio: ' + (dadosLead.beneficio || '-') + '\nPlano atual: ' + (dadosLead.planoAtual || '-') +
        '\n\nAssuma esse atendimento ou ative algum corretor.'
      );
      return null;
    }

    var corretor = corretores[0];

    // Cria lead no pipeline do corretor (status: em_contato)
    var leadPipelineRes = await fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        lead_phone: phone,
        lead_empresa: dadosLead.cnpj || '',
        lead_nome: nomeCliente,
        lead_plano_atual: dadosLead.planoAtual || '',
        lead_tipo: dadosLead.tipo || '',
        lead_beneficio: dadosLead.beneficio || '',
        corretor_id: corretor.id,
        status: 'em_contato',
        distribuido_em: new Date().toISOString()
      })
    });

    // Salva lead no CRM do corretor
    await fetch(SUPABASE_URL + '/rest/v1/crm_leads', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        corretor_id: corretor.id,
        empresa: dadosLead.cnpj || nomeCliente || '',
        contato: nomeCliente || '',
        telefone: phone,
        origem: 'sdr',
        nota: 'Plano atual: ' + (dadosLead.planoAtual || 'nao informado') + ' | Tipo: ' + (dadosLead.tipo || '-') + ' | Beneficio: ' + (dadosLead.beneficio || '-'),
        status: 'contato'
      })
    });

    // Atualiza contador do corretor
    await fetch(SUPABASE_URL + '/rest/v1/corretores?id=eq.' + corretor.id, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ultimo_lead_em: new Date().toISOString(), total_leads_recebidos: (corretor.total_leads_recebidos || 0) + 1 })
    });

    // Avisa corretor no WhatsApp
    var telLimpo = phone.replace(/[^0-9]/g, '');
    var linkPronto = 'https://wa.me/' + (telLimpo.startsWith('55') ? telLimpo : '55' + telLimpo);

    await enviarMensagem(corretor.whatsapp,
      'NOVO LEAD!\n\nNome: ' + nomeCliente +
      '\nNumero: ' + phone +
      '\nCNPJ: ' + (dadosLead.cnpj || 'nao informado') +
      '\nPlano atual: ' + (dadosLead.planoAtual || 'nao informado') +
      '\nTipo: ' + (dadosLead.tipo || '-') +
      '\nBeneficio: ' + (dadosLead.beneficio || '-') +
      '\n\nAbrir conversa: ' + linkPronto +
      '\n\nEsse lead ja esta no seu CRM em EM CONTATO.'
    );

    return { corretor: corretor.nome, corretorId: corretor.id };
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // REDISTRIBUICAO TIMEOUT
    if (body.action === 'redistribuir_timeout') {
      var limite = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      var pendRes = await fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos?status=eq.em_contato&distribuido_em=lt.' + limite + '&select=*', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
      var pendentes = pendRes.ok ? (await pendRes.json()) : [];
      for (var pi = 0; pi < pendentes.length; pi++) {
        var p = pendentes[pi];
        await fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos?id=eq.' + p.id, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'expirado' }) });
        await distribuirLead(p.lead_phone, p.lead_nome || p.lead_phone, { cnpj: p.lead_empresa, tipo: p.lead_tipo, beneficio: p.lead_beneficio, planoAtual: p.lead_plano_atual });
      }
      return res.status(200).json({ ok: true, redistribuidos: pendentes.length });
    }

    // FOLLOW-UP
    if (req.method === 'GET' || body.action === 'followup') {
      var agora = new Date();
      var horaBrasilia = agora.getUTCHours() - 3;
      if (horaBrasilia < 0) horaBrasilia += 24;
      if (horaBrasilia < 9 || horaBrasilia >= 18) return res.status(200).json({ ok: true, msg: 'Fora do horario comercial' });
      var fuRes = await fetch(SUPABASE_URL + '/rest/v1/sdr_followup?enviado=eq.false&select=*&order=created_at.asc&limit=50', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
      var followups = fuRes.ok ? (await fuRes.json()) : [];
      for (var fi = 0; fi < followups.length; fi++) {
        var fu = followups[fi];
        var msgFU = fi === 0
          ? 'Ola! Passei por aqui mas nao vi sua resposta. Ainda posso conectar voce com um especialista em plano de saude empresarial. Tem interesse?'
          : 'Ultima tentativa. Nosso especialista esta disponivel para te apresentar as melhores opcoes de plano de saude. Posso conectar voce agora?';
        await enviarMensagem(fu.phone, msgFU);
        await fetch(SUPABASE_URL + '/rest/v1/sdr_followup?id=eq.' + fu.id, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ enviado: true, enviado_em: new Date().toISOString() }) });
        if (fi < followups.length - 1) await sleep(30000);
      }
      return res.status(200).json({ ok: true });
    }

    // WEBHOOK PRINCIPAL
    const messageId = body.messageId || '';
    const fromMe    = body.fromMe || false;
    const phone     = body.phone || (body.from && body.from.replace('@s.whatsapp.net', '').replace('@c.us', '')) || '';
    const mensagem  = (body.text && body.text.message) || body.body || body.message || '';

    // ANTI-DUPLICATA via Supabase
    if (messageId) {
      try {
        var dupInsert = await fetch(SUPABASE_URL + '/rest/v1/sdr_processados', {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({ message_id: messageId, phone: phone })
        });
        // Verifica se ja existia
        var checkDup = await fetch(SUPABASE_URL + '/rest/v1/sdr_processados?message_id=eq.' + encodeURIComponent(messageId) + '&select=created_at', {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        var dupData = checkDup.ok ? (await checkDup.json()) : [];
        if (dupData.length > 0 && dupInsert.status === 409) return res.status(200).json({ ok: true, motivo: 'duplicata' });
        // Limpa antigos
        var lim10 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        fetch(SUPABASE_URL + '/rest/v1/sdr_processados?created_at=lt.' + lim10, { method: 'DELETE', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
      } catch(e) {}
    }

    if (!phone || !mensagem || fromMe) return res.status(200).json({ ok: true });

    var phoneLimpo = phone.replace(/[^0-9]/g, '').replace(/^55/, '');
    if (phoneLimpo === '21973855107') return res.status(200).json({ ok: true });

    // Ignora corretores
    var corrCheckRes = await fetch(SUPABASE_URL + '/rest/v1/corretores?whatsapp=eq.' + phone + '&select=id', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
    var corrCheck = corrCheckRes.ok ? (await corrCheckRes.json()) : [];
    if (corrCheck.length > 0) return res.status(200).json({ ok: true });

    // Busca dados do lead
    var leadRes = await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone + '&select=*&limit=1', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
    var leads = leadRes.ok ? (await leadRes.json()) : [];
    var leadData = leads[0] || {};

    var nomeCliente   = leadData.nome || '';
    var cnpjLead      = leadData.empresa || '';
    var beneficioLead = leadData.horario || '';
    var planoAtualLead = '';
    var tipoLead = '';

    // Extrai dados da mensagem se nao estiverem no banco
    if (!nomeCliente && mensagem.includes('Meu nome e')) { var mn = mensagem.match(/Meu nome e ([^\n.]+)/); if (mn) nomeCliente = mn[1].trim(); }
    if (!cnpjLead && mensagem.includes('CNPJ:')) { var mc = mensagem.match(/CNPJ:\s*([^\n]+)/); if (mc) cnpjLead = mc[1].trim(); }
    if (mensagem.includes('Plano atual:')) { var mp = mensagem.match(/Plano atual:\s*([^\n]+)/); if (mp) planoAtualLead = mp[1].trim(); }
    if (mensagem.includes('Tipo de plano desejado:')) { var mt = mensagem.match(/Tipo de plano desejado:\s*([^\n]+)/); if (mt) tipoLead = mt[1].trim(); }
    if (!beneficioLead && mensagem.includes('Beneficio desejado:')) { var mb = mensagem.match(/Beneficio desejado:\s*([^\n]+)/); if (mb) beneficioLead = mb[1].trim(); }

    var primeiroNome = nomeCliente ? nomeCliente.split(' ')[0] : '';

    // Verifica se e mensagem do formulario (tem CNPJ ou dados estruturados)
    var veiuDoFormulario = mensagem.includes('CNPJ:') || mensagem.includes('Vim pelo site') || cnpjLead;

    // Busca historico
    const histRes = await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas?phone=eq.' + phone + '&order=created_at.asc&limit=10', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } });
    const historico = histRes.ok ? (await histRes.json()) : [];
    const isPrimeiraMsg = historico.length === 0;

    // Salva mensagem do cliente
    await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, role: 'user', content: mensagem, created_at: new Date().toISOString() })
    });

    // FLUXO FORMULARIO — distribui direto sem perguntas
    if (veiuDoFormulario && isPrimeiraMsg) {
      var msg1 = 'Ola, ' + (primeiroNome || 'tudo bem') + '! Aqui e o Estevao da Veracity Seguros. Recebi seu cadastro e ja estou verificando a elegibilidade do seu CNPJ.';
      await sleep(2000);
      await enviarMensagem(phone, msg1);
      await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone, role: 'assistant', content: msg1, created_at: new Date().toISOString() }) });

      await sleep(10000);

      var msg2 = 'Otima noticia! O CNPJ esta elegivel para o beneficio de ' + (beneficioLead || 'primeira mensalidade') + ' gratuita. Nosso especialista ja vai entrar em contato com voce.';
      await enviarMensagem(phone, msg2);
      await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone, role: 'assistant', content: msg2, created_at: new Date().toISOString() }) });

      // Distribui para corretor
      await distribuirLead(phone, nomeCliente, { cnpj: cnpjLead, planoAtual: planoAtualLead, tipo: tipoLead, beneficio: beneficioLead });

      // Atualiza status do lead
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, { method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'quente', updated_at: new Date().toISOString() }) });

      return res.status(200).json({ ok: true, fluxo: 'formulario' });
    }

    // FLUXO DIRETO — mensagem sem dados do formulario
    if (isPrimeiraMsg) {
      var msgDireto = 'Ola! Aqui e o Estevao da Veracity Seguros. Vou conectar voce com um de nossos especialistas em plano de saude empresarial. Em instantes ele entrara em contato.';
      await sleep(2000);
      await enviarMensagem(phone, msgDireto);
      await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas', { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone, role: 'assistant', content: msgDireto, created_at: new Date().toISOString() }) });

      // Distribui direto
      await distribuirLead(phone, nomeCliente || phone, { cnpj: '', planoAtual: '', tipo: '', beneficio: '' });

      // Salva lead
      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads', { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates' }, body: JSON.stringify({ phone: phone, nome: nomeCliente || '', status: 'quente', origem: 'direto', created_at: new Date().toISOString() }) });

      return res.status(200).json({ ok: true, fluxo: 'direto' });
    }

    // MENSAGENS SUBSEQUENTES — nao responde mais (corretor ja assumiu)
    return res.status(200).json({ ok: true, fluxo: 'subsequente' });

  } catch(e) {
    console.error('Erro zapi-webhook:', e);
    return res.status(200).json({ ok: true, erro: e.message });
  }
}
