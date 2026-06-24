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
  const NOME_SDR      = 'Rodrigo';

  // ── DISTRIBUI LEAD PARA CORRETOR DISPONIVEL ────────────────────────────
  async function distribuirLead(phone, nomeEmpresa, historicoTexto) {
    // Busca corretores disponiveis, ordenado por quem recebeu lead ha mais tempo (round-robin)
    var corrRes = await fetch(
      SUPABASE_URL + '/rest/v1/corretores?disponivel=eq.true&order=ultimo_lead_em.asc.nullsfirst&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    var corretores = corrRes.ok ? (await corrRes.json()) : [];

    if (!corretores.length) {
      // Nenhum disponivel -> cai pro gestor (fallback)
      var avisoFallback = 'LEAD QUENTE — NENHUM CORRETOR DISPONIVEL!\n\n'
        + 'Numero: ' + phone + '\n'
        + 'Empresa: ' + (nomeEmpresa || 'desconhecida') + '\n\n'
        + 'Conversa:\n' + historicoTexto + '\n\n'
        + 'Assuma esse atendimento ou ative algum corretor.';
      await fetch(ZAPI_URL + '/send-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
        body: JSON.stringify({ phone: MEU_WHATSAPP, message: avisoFallback })
      });
      return null;
    }

    var corretor = corretores[0];

    // Cria registro de distribuicao
    var distRes = await fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        lead_phone: phone,
        lead_empresa: nomeEmpresa || '',
        corretor_id: corretor.id,
        status: 'aguardando_resposta'
      })
    });
    var distData = distRes.ok ? (await distRes.json()) : [];
    var distId = distData[0] ? distData[0].id : null;

    // Atualiza corretor: ultimo_lead_em e contador
    await fetch(SUPABASE_URL + '/rest/v1/corretores?id=eq.' + corretor.id, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ultimo_lead_em: new Date().toISOString(), total_leads_recebidos: (corretor.total_leads_recebidos || 0) + 1 })
    });

    // Monta link pronto pro corretor abrir o WhatsApp com o cliente
    var telLimpo = phone.replace(/[^0-9]/g, '');
    var linkPronto = 'https://wa.me/' + telLimpo;

    var avisoCorretor = 'NOVO LEAD QUENTE PARA VOCE!\n\n'
      + 'Empresa: ' + (nomeEmpresa || 'desconhecida') + '\n'
      + 'Numero: ' + phone + '\n\n'
      + 'Conversa com o SDR:\n' + historicoTexto + '\n\n'
      + 'Clique para abrir a conversa: ' + linkPronto + '\n\n'
      + 'Voce tem 15 minutos para responder, ou o lead sera redistribuido.';

    await fetch(ZAPI_URL + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: corretor.whatsapp, message: avisoCorretor })
    });

    return { corretor: corretor.nome, distId: distId };
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // ── REDISTRIBUICAO POR TIMEOUT (15 min sem resposta do corretor) ───────
    if (body.action === 'redistribuir_timeout') {
      var limite = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      var pendRes = await fetch(
        SUPABASE_URL + '/rest/v1/leads_distribuidos?status=eq.aguardando_resposta&distribuido_em=lt.' + limite + '&select=*',
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
      );
      var pendentes = pendRes.ok ? (await pendRes.json()) : [];
      var redistribuidos = 0;

      for (var pi = 0; pi < pendentes.length; pi++) {
        var p = pendentes[pi];
        // Marca o antigo como expirado
        await fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos?id=eq.' + p.id, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'expirado_sem_resposta' })
        });
        // Busca historico de novo pra reenviar
        var histR = await fetch(SUPABASE_URL + '/rest/v1/sdr_conversas?phone=eq.' + p.lead_phone + '&order=created_at.asc&limit=10', {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        var histArr = histR.ok ? (await histR.json()) : [];
        var histTxt = histArr.slice(-6).map(function(h) { return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content; }).join('\n');

        var resultado = await distribuirLead(p.lead_phone, p.lead_empresa, histTxt);
        if (resultado) redistribuidos++;
      }

      return res.status(200).json({ ok: true, redistribuidos: redistribuidos, total: pendentes.length });
    }

    // ── FOLLOW-UP ──────────────────────────────────────────────────────────
    if (req.method === 'GET' || body.action === 'followup') {
      var agora2 = new Date();
      var horaBrasilia2 = agora2.getUTCHours() - 3;
      if (horaBrasilia2 < 0) horaBrasilia2 += 24;
      if (horaBrasilia2 < 9 || horaBrasilia2 >= 18) {
        return res.status(200).json({ ok: true, msg: 'Fora do horario comercial', hora: horaBrasilia2 });
      }
      var MSGS_FU = {
        1: 'Ola! Passei por aqui anteriormente mas nao vi sua resposta. Ainda podemos realizar uma analise gratuita do seu plano de saude empresarial. Tem interesse?',
        2: 'Ultima oportunidade! Nossa analise gratuita para planos de saude empresarial esta disponivel por tempo limitado. Posso te apresentar as opcoes?'
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

    // Se o numero que mandou mensagem é de algum corretor cadastrado, ignora (SDR nao responde corretor)
    var corrCheckRes = await fetch(SUPABASE_URL + '/rest/v1/corretores?whatsapp=eq.' + phone + '&select=id', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
    var corrCheck = corrCheckRes.ok ? (await corrCheckRes.json()) : [];
    if (corrCheck.length > 0) {
      return res.status(200).json({ ok: true, msg: 'mensagem de corretor ignorada pelo SDR' });
    }

    // Busca nome da empresa
    var nomeEmpresa = '';
    var leadRes = await fetch(
      SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone + '&select=empresa&limit=1',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    if (leadRes.ok) {
      var leads = await leadRes.json();
      if (leads && leads[0] && leads[0].empresa) nomeEmpresa = leads[0].empresa;
    }

    const SDR_SYSTEM = `Voce e ${NOME_SDR}, especialista em planos de saude empresarial da Veracity Seguros, no Rio de Janeiro.

EMPRESA DO LEAD: ${nomeEmpresa || 'nao identificada'}

REGRAS ABSOLUTAS:
- NUNCA use emojis
- NUNCA diga que e uma IA
- Seja natural, direto e profissional
- Maximo 3 frases por mensagem
- NUNCA mencione operadoras especificas antes de o cliente mencionar
- NUNCA interprete saudacoes como "tdb", "tudo bem", "oi", "boa tarde" como resposta a uma pergunta de opcoes
- Se o cliente mandar apenas saudacao ou confirmacao generica (ok, certo, entendi, obrigado), mantenha a ultima pergunta ou avance naturalmente sem pular etapas
- Quando o cliente der opcoes numeradas (1, 2, 3) responda naturalmente interpretando a escolha
- NUNCA encerre sem tentar pelo menos 3 vezes

FLUXO OBRIGATORIO — siga essa ordem exata:

ETAPA 1 — Primeira resposta do cliente (qualquer coisa, inclusive saudacao):
Responda SEMPRE: "Perfeito. Meu nome e ${NOME_SDR} e falo da Veracity Seguros. Estou entrando em contato porque realizamos uma analise gratuita para empresas e profissionais que utilizam CNPJ para contratacao de plano de saude. Hoje voce ja possui plano de saude?\n1 - Sim\n2 - Nao"

ETAPA 2A — Cliente TEM plano (respondeu sim, 1, ou confirmou ter plano):
Responda: "Entendi! Que bom que estamos conversando no momento certo. Contratar pelo CNPJ tem vantagens que muita gente nao conhece.\n\nQuem voce incluiria no plano?\n1 - Voce e familia\n2 - Voce e seus colaboradores\n3 - Todos"
Depois aguarde resposta clara antes de avancar.
Depois: "Qual operadora voce utiliza atualmente?\n1 - Bradesco\n2 - SulAmerica\n3 - Amil\n4 - Unimed\n5 - Assim\n6 - Outra"
Depois aguarde resposta.
Depois: "Qual seu principal objetivo hoje?\n1 - Reduzir custos\n2 - Melhorar cobertura\n3 - Melhorar atendimento\n4 - Apenas comparar opcoes"

ETAPA 2B — Cliente NAO TEM plano (respondeu nao, 2, ou confirmou nao ter):
Responda: "Entendi! Que bom que estamos conversando no momento certo. Contratar pelo CNPJ tem vantagens que muita gente nao conhece.\n\nQuem voce incluiria no plano?\n1 - Voce e familia\n2 - Voce e seus colaboradores\n3 - Todos"
Depois aguarde resposta.
Depois: "Qual seu principal objetivo?\n1 - Contratar pela primeira vez\n2 - Conhecer valores\n3 - Avaliar opcoes\n4 - Beneficio para colaboradores"

ETAPA 3 — Apos coletar objetivo (aguarde resposta antes de avancar):
Responda: "Perfeito. Para te orientar da melhor forma, voce prefere:\n1 - Ligacao rapida com um especialista\n2 - Continuar pelo WhatsApp"

ETAPA 4A — Escolheu LIGACAO (respondeu 1):
Responda: "Qual o melhor horario para te ligar?"
Quando informar horario: "Anotado. Nosso especialista entrara em contato no horario combinado." e inclua [LEAD_AGENDADO:horario]

ETAPA 4B — Escolheu WHATSAPP (respondeu 2):
Responda: "Quantas vidas aproximadamente?\n1 - 2 a 4\n2 - 5 a 9\n3 - 10 a 29\n4 - 30 ou mais"
Depois: "Perfeito. Vou encaminhar suas informacoes para um especialista da Veracity Seguros que dara continuidade ao seu atendimento." e inclua [LEAD_QUENTE]

RECUSAS:
1a recusa: "Entendo. Mas nossa analise e completamente gratuita e sem compromisso. Vale apenas 5 minutos. Posso prosseguir?"
2a recusa: "Sem problema. Posso te enviar uma proposta por aqui mesmo para voce avaliar no seu tempo?"
3a recusa: agradeca e inclua [LEAD_FRIO]

CLASSIFICACAO:
- Lead qualificado pelo WhatsApp: inclua [LEAD_QUENTE]
- Agendar ligacao: inclua [LEAD_AGENDADO:horario]
- Recusar definitivamente: inclua [LEAD_FRIO]`;

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
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 400, system: SDR_SYSTEM, messages: messages })
    });

    const claudeData = await claudeRes.json();
    var resposta = (claudeData.content && claudeData.content[0] && claudeData.content[0].text) || 'Obrigado! Em breve nosso especialista entrara em contato.';

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

    // LEAD QUENTE — distribui para corretor disponivel
    if (isQuente) {
      var historicoTexto = historico.slice(-8).map(function(h) {
        return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content;
      }).join('\n');

      await distribuirLead(phone, nomeEmpresa, historicoTexto);

      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'quente', updated_at: new Date().toISOString() })
      });
    }

    // LEAD AGENDADO — avisa Rodrigo no WhatsApp
    if (isAgendado) {
      var historicoTexto2 = historico.slice(-8).map(function(h) {
        return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content;
      }).join('\n');
      var avisoAgendado = 'LEAD AGENDADO!\n\nNumero: ' + phone + '\nEmpresa: ' + (nomeEmpresa || 'desconhecida') + '\nHorario: ' + (horarioAgendado || 'a confirmar') + '\n\nConversa:\n' + historicoTexto2 + '\n\nLigue no horario combinado!';
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
