export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://veracitytech.com.br');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTEyOTUsImV4cCI6MjA5MjM4NzI5NX0.sUmFeXhXsx7D7BKPrKrXFHSVuqhFdIKgOCdfUQumECY';
  const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
  const ZAPI_INSTANCE = '3F2D8A534997C11828D5BE88BF499E29';
  const ZAPI_TOKEN = 'A2477B3E3DF335B5628DFAFB';
  const ZAPI_CLIENT_TOKEN = 'Ff188b6b28a4843bca38f82e84c5a597dS';
  const ZAPI_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;
  const DELAY_MS = 180000; // 3 minutos

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Não autorizado' });
    const token = authHeader.replace('Bearer ', '');
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Token inválido' });
    const userData = await userRes.json();
    const userId = userData.id;
    if (!userId) return res.status(401).json({ error: 'Usuário não encontrado' });

    const { action, campanha_id, dados } = req.body;

    // ── CRIAR CAMPANHA ──
    if (action === 'criar') {
      const { nome, template, mensagem, contatos } = dados;
      const campRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ user_id: userId, nome, template, mensagem, total: contatos.length, status: 'ativa' })
      });
      const campData = await campRes.json();
      const camp = campData[0];
      const contatosPayload = contatos.map(c => ({ campanha_id: camp.id, nome: c.nome, telefone: c.telefone, mensagem: c.mensagem, status: 'pendente' }));
      await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(contatosPayload)
      });
      return res.status(200).json({ ok: true, campanha_id: camp.id });
    }

    // ── DISPARAR TUDO NO SERVIDOR ──
    if (action === 'disparar_tudo') {
      // Busca contatos pendentes da campanha
      const contatosRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?campanha_id=eq.${campanha_id}&status=eq.pendente&order=created_at.asc`, {
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
      });
      const contatos = await contatosRes.json();

      if (!contatos || !contatos.length) {
        return res.status(200).json({ ok: true, enviadas: 0, msg: 'Nenhum contato pendente' });
      }

      let enviadas = 0;
      let erros = 0;

      for (let i = 0; i < contatos.length; i++) {
        const c = contatos[i];

        // Verifica se campanha foi pausada/cancelada
        const campCheck = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}&select=status`, {
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
        });
        const campData = await campCheck.json();
        if (!campData[0] || campData[0].status === 'pausada' || campData[0].status === 'cancelada') {
          return res.status(200).json({ ok: true, enviadas, parado: true, msg: 'Campanha pausada ou cancelada' });
        }

        // Envia mensagem
        const tel = c.telefone.replace(/[^0-9]/g, '');
        const telFull = tel.startsWith('55') ? tel : '55' + tel;
        const zapiRes = await fetch(`${ZAPI_URL}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'client-token': ZAPI_CLIENT_TOKEN },
          body: JSON.stringify({ phone: telFull, message: c.mensagem })
        });
        const zapiData = await zapiRes.json();
        const messageId = zapiData.zaapId || zapiData.messageId || null;
        const sucesso = zapiRes.ok && !zapiData.error;

        // Atualiza status do contato
        await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${c.id}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: sucesso ? 'enviada' : 'erro', message_id: messageId })
        });

        // Atualiza contador
        if (sucesso) {
          enviadas++;
          const campAtual = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}&select=enviadas`, {
            headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
          });
          const cd = await campAtual.json();
          await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ enviadas: (cd[0]?.enviadas || 0) + 1 })
          });
        } else {
          erros++;
        }

        // Aguarda 3 minutos antes do próximo — exceto no último
        if (i < contatos.length - 1) {
          await delay(DELAY_MS);
        }
      }

      // Marca campanha como concluída
      await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'concluida' })
      });

      return res.status(200).json({ ok: true, enviadas, erros });
    }

    // ── PAUSAR CAMPANHA ──
    if (action === 'pausar') {
      await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pausada' })
      });
      return res.status(200).json({ ok: true });
    }

    // ── RETOMAR CAMPANHA ──
    if (action === 'retomar') {
      await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ativa' })
      });
      return res.status(200).json({ ok: true });
    }

    // ── CANCELAR CAMPANHA ──
    if (action === 'cancelar') {
      await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelada' })
      });
      return res.status(200).json({ ok: true });
    }

    // ── ENVIAR MENSAGEM AVULSA ──
    if (action === 'enviar') {
      const { telefone, mensagem, contato_id: cId } = dados;
      const tel = telefone.replace(/[^0-9]/g, '');
      const telFull = tel.startsWith('55') ? tel : '55' + tel;
      const zapiRes = await fetch(`${ZAPI_URL}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'client-token': ZAPI_CLIENT_TOKEN },
        body: JSON.stringify({ phone: telFull, message: mensagem })
      });
      const zapiData = await zapiRes.json();
      const messageId = zapiData.zaapId || zapiData.messageId || null;
      const sucesso = zapiRes.ok && !zapiData.error;
      if (cId && cId !== 'teste') {
        await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${cId}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: sucesso ? 'enviada' : 'erro', message_id: messageId })
        });
      }
      if (sucesso && campanha_id && campanha_id !== 'teste') {
        const campAtual = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}&select=enviadas`, {
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
        });
        const campData2 = await campAtual.json();
        const enviadas = (campData2[0]?.enviadas || 0) + 1;
        await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enviadas })
        });
      }
      return res.status(200).json({ ok: sucesso, messageId, error: zapiData.error, zapiData });
    }

    // ── LISTAR CAMPANHAS ──
    if (action === 'listar') {
      const campRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?user_id=eq.${userId}&order=created_at.desc&limit=20`, {
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
      });
      const campanhas = await campRes.json();
      return res.status(200).json({ ok: true, campanhas });
    }

    // ── LISTAR CONTATOS ──
    if (action === 'contatos') {
      const contatosRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?campanha_id=eq.${campanha_id}&order=created_at.asc`, {
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
      });
      const contatos = await contatosRes.json();
      return res.status(200).json({ ok: true, contatos });
    }

    return res.status(400).json({ error: 'Ação inválida' });

  } catch(e) {
    console.error('Erro campanha:', e);
    return res.status(500).json({ error: 'Erro interno: ' + e.message });
  }
}
