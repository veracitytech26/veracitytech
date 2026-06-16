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
- Quando o cliente der opcoes numeradas responda naturalmente interpretando a escolha
- NUNCA encerre sem tentar pelo menos 3 vezes

FLUXO OBRIGATORIO — siga essa ordem exata:

ETAPA 1 — Primeira resposta do cliente (qualquer coisa):
Responda: "Perfeito. Meu nome e ${NOME_SDR} e falo da Veracity Seguros. Estou entrando em contato porque realizamos uma analise gratuita para empresas e profissionais que utilizam CNPJ para contratacao de plano de saude. Hoje voce ja possui plano de saude?\n1 - Sim\n2 - Nao"

ETAPA 2A — Cliente TEM plano (respondeu sim ou 1):
Responda: "Entendi. Esse plano atende:\n1 - Familia\n2 - Colaboradores\n3 - Ambos"
Depois: "Qual operadora voce utiliza atualmente?\n1 - Bradesco\n2 - SulAmerica\n3 - Amil\n4 - Unimed\n5 - Assim\n6 - Outra"
Depois: "Qual seu principal objetivo hoje?\n1 - Reduzir custos\n2 - Melhorar cobertura\n3 - Melhorar atendimento\n4 - Apenas comparar opcoes"

ETAPA 2B — Cliente NAO TEM plano (respondeu nao ou 2):
Responda: "Entendi. O plano seria para:\n1 - Familia\n2 - Colaboradores\n3 - Ambos"
Depois: "Qual seu principal objetivo?\n1 - Contratar pela primeira vez\n2 - Conhecer valores\n3 - Avaliar opcoes\n4 - Beneficio para colaboradores"

ETAPA 3 — Apos coletar objetivo:
Responda: "Perfeito. Para te orientar da melhor forma, voce prefere:\n1 - Ligacao rapida com um especialista\n2 - Continuar pelo WhatsApp"

ETAPA 4A — Escolheu LIGACAO (respondeu 1):
Responda: "Perfeito. Qual o melhor horario para te ligar?" e quando informar diga "Anotado! Nosso especialista entrara em contato no horario combinado." e inclua [LEAD_AGENDADO:horario]

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

    // Envia resposta ao cliente
    await fetch(ZAPI_URL + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
      body: JSON.stringify({ phone: phone, message: resposta })
    });

    var agora = new Date();

    // LEAD QUENTE — avisa Rodrigo no WhatsApp para ligar manualmente
    if (isQuente) {
      var historicoTexto = historico.slice(-8).map(function(h) {
        return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content;
      }).join('\n');

      var avisoMsg = 'LEAD QUENTE!\n\n'
        + 'Numero: ' + phone + '\n'
        + 'Empresa: ' + (nomeEmpresa || 'desconhecida') + '\n'
        + 'Hora: ' + agora.toLocaleTimeString('pt-BR', {timeZone:'America/Sao_Paulo'}) + '\n\n'
        + 'Conversa:\n' + historicoTexto + '\n\n'
        + 'Ligue pelo discador da plataforma!';

      await fetch(ZAPI_URL + '/send-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
        body: JSON.stringify({ phone: MEU_WHATSAPP, message: avisoMsg })
      });

      await fetch(SUPABASE_URL + '/rest/v1/sdr_leads?phone=eq.' + phone, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'quente', updated_at: new Date().toISOString() })
      });
    }

    // LEAD AGENDADO — avisa Rodrigo no WhatsApp com horario
    if (isAgendado) {
      var historicoTexto2 = historico.slice(-8).map(function(h) {
        return (h.role === 'user' ? 'Cliente' : 'SDR') + ': ' + h.content;
      }).join('\n');

      var avisoAgendado = 'LEAD AGENDADO!\n\n'
        + 'Numero: ' + phone + '\n'
        + 'Empresa: ' + (nomeEmpresa || 'desconhecida') + '\n'
        + 'Horario: ' + (horarioAgendado || 'a confirmar') + '\n\n'
        + 'Conversa:\n' + historicoTexto2 + '\n\n'
        + 'Ligue no horario combinado pelo discador da plataforma!';

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
