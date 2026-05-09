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

  try {
    const body = req.body;
    console.log('Z-API Webhook:', JSON.stringify(body).slice(0, 300));

    // STATUS DE ENTREGA/LEITURA
    if (body.status && (body.status === 'DELIVERED' || body.status === 'READ' || body.status === 'PLAYED')) {
      const messageId = body.zaapId || body.id;
      if (messageId) {
        const updateData = {};
        if (body.status === 'DELIVERED') updateData.entregue = true;
        if (body.status === 'READ' || body.status === 'PLAYED') { updateData.entregue = true; updateData.lida = true; }

        const contatoRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?message_id=eq.${messageId}&select=id,campanha_id,entregue,lida`, {
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
        });
        const contatos = await contatoRes.json();

        if (contatos && contatos[0]) {
          const contato = contatos[0];
          await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contato.id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
          });

          if (contato.campanha_id) {
            const campRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}&select=entregues,lidas`, {
              headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
            });
            const camps = await campRes.json();
            if (camps && camps[0]) {
              const campUpdate = {};
              if (updateData.entregue && !contato.entregue) campUpdate.entregues = (camps[0].entregues || 0) + 1;
              if (updateData.lida && !contato.lida) campUpdate.lidas = (camps[0].lidas || 0) + 1;
              if (Object.keys(campUpdate).length > 0) {
                await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}`, {
                  method: 'PATCH',
                  headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify(campUpdate)
                });
              }
            }
          }
        }
      }
    }

    // RESPOSTA RECEBIDA — SDR IA
    if (body.fromMe === false && body.text && body.text.message) {
      const phone = (body.phone || '').replace(/[^0-9]/g, '');
      const texto = body.text.message;
      const nomeEmpresa = body.pushname || '';

      if (!phone || !texto) return res.status(200).json({ ok: true });

      // Busca contato pelo telefone
      const tel8 = phone.slice(-8);
      const contatoRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?select=id,campanha_id,nome,telefone,mensagem,respondeu&status=eq.enviada`, {
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
      });
      const todosContatos = await contatoRes.json();
      const contato = (todosContatos || []).find(c => c.telefone && c.telefone.replace(/[^0-9]/g,'').slice(-8) === tel8);

      if (!contato) return res.status(200).json({ ok: true });

      // Marca como respondeu
      await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contato.id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ respondeu: true, resposta: texto, status: 'respondeu' })
      });

      // Atualiza contador respondidas
      if (contato.campanha_id) {
        const campRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}&select=respondidas`, {
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
        });
        const camps = await campRes.json();
        if (camps && camps[0]) {
          await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ respondidas: (camps[0].respondidas || 0) + 1 })
          });
        }
      }

      // CLAUDE SDR — Analisa e responde
      if (!CLAUDE_KEY) {
        console.error('ANTHROPIC_API_KEY não configurada');
        return res.status(200).json({ ok: true });
      }

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Você é um SDR especialista em planos de saúde empresariais. Enviou mensagem de prospecção para a empresa "${contato.nome || nomeEmpresa}" e recebeu:

"${texto}"

Sua mensagem original foi: "${contato.mensagem || ''}"

Retorne APENAS um JSON:
{
  "classificacao": "interesse" | "duvida" | "agendamento" | "nao_quer",
  "resposta": "sua resposta (máximo 3 linhas, amigável, se nao_quer deixe vazio)"
}

- interesse: quer saber mais
- duvida: tem dúvida específica  
- agendamento: quer reunião/ligação
- nao_quer: recusou claramente`
          }]
        })
      });

      const claudeData = await claudeRes.json();
      const claudeText = claudeData.content && claudeData.content[0] && claudeData.content[0].text;

      let classificacao = 'duvida';
      let respostaIA = '';

      try {
        const parsed = JSON.parse(claudeText);
        classificacao = parsed.classificacao || 'duvida';
        respostaIA = parsed.resposta || '';
      } catch(e) {
        console.error('Erro parse Claude:', e);
      }

      // Atualiza classificação
      await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contato.id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: classificacao === 'nao_quer' ? 'frio' : (classificacao === 'interesse' || classificacao === 'agendamento') ? 'quente' : 'respondeu',
          resposta: texto
        })
      });

      // Envia resposta da IA
      if (respostaIA && classificacao !== 'nao_quer') {
        const telFull = phone.startsWith('55') ? phone : '55' + phone;
        await fetch(`${ZAPI_URL}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'client-token': ZAPI_CLIENT_TOKEN },
          body: JSON.stringify({ phone: telFull, message: respostaIA })
        });

        // Atualiza contador de quentes
        if ((classificacao === 'interesse' || classificacao === 'agendamento') && contato.campanha_id) {
          const campRes2 = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}&select=quentes`, {
            headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
          });
          const camps2 = await campRes2.json();
          if (camps2 && camps2[0]) {
            await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}`, {
              method: 'PATCH',
              headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
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
