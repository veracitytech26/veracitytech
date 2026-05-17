export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).end();

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
  const CLAUDE_KEY = process.env.ANTHROPIC_API_KEY;
  const ZAPI_INSTANCE = '3F2D8A534997C11828D5BE88BF499E29';
  const ZAPI_TOKEN = 'A2477B3E3DF335B5628DFAFB';
  const ZAPI_CLIENT_TOKEN = 'Ff188b6b28a4843bca38f82e84c5a597dS';
  const ZAPI_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;

  const sHeaders = { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Accept': 'application/json', 'Content-Type': 'application/json' };

  try {
    const body = req.body;
    console.log('Z-API Webhook:', JSON.stringify(body).slice(0, 300));

    // ── STATUS DE ENTREGA/LEITURA ──
    if (body.status && (body.status === 'DELIVERED' || body.status === 'READ' || body.status === 'PLAYED')) {
      const messageId = body.zaapId || body.id;
      if (messageId) {
        const updateData = {};
        if (body.status === 'DELIVERED') updateData.entregue = true;
        if (body.status === 'READ' || body.status === 'PLAYED') { updateData.entregue = true; updateData.lida = true; }

        const contatoRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?message_id=eq.${messageId}&select=id,campanha_id,entregue,lida`, { headers: sHeaders });
        const contatos = await contatoRes.json();

        if (contatos && contatos[0]) {
          const contato = contatos[0];
          await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contato.id}`, { method: 'PATCH', headers: sHeaders, body: JSON.stringify(updateData) });

          if (contato.campanha_id) {
            const campRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}&select=entregues,lidas`, { headers: sHeaders });
            const camps = await campRes.json();
            if (camps && camps[0]) {
              const campUpdate = {};
              if (updateData.entregue && !contato.entregue) campUpdate.entregues = (camps[0].entregues || 0) + 1;
              if (updateData.lida && !contato.lida) campUpdate.lidas = (camps[0].lidas || 0) + 1;
              if (Object.keys(campUpdate).length > 0) {
                await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}`, { method: 'PATCH', headers: sHeaders, body: JSON.stringify(campUpdate) });
              }
            }
          }
        }
      }
    }

    // ── RESPOSTA RECEBIDA ──
    if (body.fromMe === false && body.text && body.text.message) {
      const phone = (body.phone || '').replace(/[^0-9]/g, '');
      const texto = body.text.message;
      const nomeEmpresa = body.pushname || '';

      if (!phone || !texto) return res.status(200).json({ ok: true });

      // Busca contato pelo telefone
      const tel8 = phone.slice(-8);
      const contatoRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?select=id,campanha_id,user_id,nome,telefone,mensagem,respondeu&status=eq.enviada`, { headers: sHeaders });
      const todosContatos = await contatoRes.json();
      const contato = (todosContatos || []).find(c => c.telefone && c.telefone.replace(/[^0-9]/g,'').slice(-8) === tel8);

      if (!contato) return res.status(200).json({ ok: true });

      // Marca como respondeu
      await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contato.id}`, {
        method: 'PATCH', headers: sHeaders,
        body: JSON.stringify({ respondeu: true, resposta: texto, status: 'respondeu' })
      });

      // Atualiza contador respondidas
      if (contato.campanha_id) {
        const campRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}&select=respondidas`, { headers: sHeaders });
        const camps = await campRes.json();
        if (camps && camps[0]) {
          await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}`, {
            method: 'PATCH', headers: sHeaders,
            body: JSON.stringify({ respondidas: (camps[0].respondidas || 0) + 1 })
          });
        }
      }

      // ── VERIFICA SE O CORRETOR TEM SDR IA ATIVO ──
      const userId = contato.user_id;
      let sdrAtivo = false;

      if (userId) {
        const perfilRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=addon_sdr,disparo_vencimento`, { headers: sHeaders });
        const perfis = await perfilRes.json();
        const perfil = perfis && perfis[0];

        if (perfil && perfil.addon_sdr) {
          // Verifica se o Veracity Disparo não está vencido
          if (perfil.disparo_vencimento) {
            const venc = new Date(perfil.disparo_vencimento);
            sdrAtivo = venc > new Date();
          } else {
            sdrAtivo = true; // sem data de vencimento = ativo indefinidamente
          }
        }
      }

      // Se SDR não está ativo, apenas registra a resposta e não responde automaticamente
      if (!sdrAtivo) {
        console.log('SDR IA não ativo para este corretor — resposta registrada sem retorno automático');
        return res.status(200).json({ ok: true });
      }

      // ── CLAUDE SDR IA ──
      if (!CLAUDE_KEY) {
        console.error('ANTHROPIC_API_KEY não configurada');
        return res.status(200).json({ ok: true });
      }

      // Busca perfil completo do corretor para personalizar o SDR
      const perfilSdrRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=name,phone,bio,creci`, { headers: sHeaders });
      const perfisSdr = await perfilSdrRes.json();
      const perfilSdr = perfisSdr && perfisSdr[0];
      const nomeCorretor = perfilSdr ? (perfilSdr.name || 'Corretor') : 'Corretor';
      const bioCorretor = perfilSdr ? (perfilSdr.bio || 'especialista em planos de saúde empresariais') : 'especialista em planos de saúde empresariais';
      const creciCorretor = perfilSdr ? (perfilSdr.creci || '') : '';

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Você é ${nomeCorretor}, ${bioCorretor}${creciCorretor ? ', CRECI ' + creciCorretor : ''}. Você enviou uma mensagem de prospecção para a empresa "${contato.nome || nomeEmpresa}" e recebeu a seguinte resposta:

"${texto}"

Sua mensagem original foi: "${contato.mensagem || ''}"

Responda de forma natural, como se fosse você mesmo respondendo no WhatsApp. Seja breve, amigável e profissional. Não mencione que é uma IA.

Retorne APENAS um JSON válido sem markdown:
{
  "classificacao": "interesse" | "duvida" | "agendamento" | "nao_quer",
  "resposta": "sua resposta em até 3 linhas. Se nao_quer, deixe vazio."
}

Classificações:
- interesse: demonstrou interesse em saber mais
- duvida: tem dúvida específica sobre valores ou cobertura
- agendamento: quer marcar reunião ou ligação
- nao_quer: recusou claramente ou pediu para não ser contactado`
          }]
        })
      });

      const claudeData = await claudeRes.json();
      const claudeText = claudeData.content && claudeData.content[0] && claudeData.content[0].text;

      let classificacao = 'duvida';
      let respostaIA = '';

      try {
        const clean = (claudeText || '').replace(/```json/g,'').replace(/```/g,'').trim();
        const parsed = JSON.parse(clean);
        classificacao = parsed.classificacao || 'duvida';
        respostaIA = parsed.resposta || '';
      } catch(e) {
        console.error('Erro parse Claude:', e, claudeText);
      }

      // Atualiza classificação no banco
      await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contato.id}`, {
        method: 'PATCH', headers: sHeaders,
        body: JSON.stringify({
          status: classificacao === 'nao_quer' ? 'frio' : (classificacao === 'interesse' || classificacao === 'agendamento') ? 'quente' : 'respondeu',
          resposta: texto
        })
      });

      // Envia resposta da IA pelo WhatsApp
      if (respostaIA && classificacao !== 'nao_quer') {
        const telFull = phone.startsWith('55') ? phone : '55' + phone;
        await fetch(`${ZAPI_URL}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'client-token': ZAPI_CLIENT_TOKEN },
          body: JSON.stringify({ phone: telFull, message: respostaIA })
        });

        // Atualiza contador de quentes
        if ((classificacao === 'interesse' || classificacao === 'agendamento') && contato.campanha_id) {
          const campRes2 = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}&select=quentes`, { headers: sHeaders });
          const camps2 = await campRes2.json();
          if (camps2 && camps2[0]) {
            await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}`, {
              method: 'PATCH', headers: sHeaders,
              body: JSON.stringify({ quentes: (camps2[0].quentes || 0) + 1 })
            });
          }
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch(e) {
    console.error('Erro webhook:', e);
    return res.status(200).json({ ok: true });
  }
}
