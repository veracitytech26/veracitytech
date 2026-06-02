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
  const ZAPI_CLIENT_TOKEN = 'F74077534357d405ca497b01736c52b96S';
  const ZAPI_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;

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

    const { action, campanha_id, dados, contato_id } = req.body;

    // ── CRIAR CAMPANHA ──
    if (action === 'criar') {
      const { nome, template, mensagem, contatos } = dados;

      // Busca todos os números que já receberam mensagem deste usuário
      const jaEnviadosRes = await fetch(
        `${SUPABASE_URL}/rest/v1/campanha_contatos?user_id=eq.${userId}&status=in.(enviada,pendente)&select=telefone`,
        { headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` } }
      );
      const jaEnviados = jaEnviadosRes.ok ? (await jaEnviadosRes.json()) : [];
      const telefonesJaEnviados = new Set(jaEnviados.map(j => j.telefone.replace(/[^0-9]/g, '')));

      // Filtra contatos que ainda não receberam
      const contatosFiltrados = contatos.filter(c => {
        const tel = (c.telefone || '').replace(/[^0-9]/g, '');
        return tel && !telefonesJaEnviados.has(tel);
      });

      const duplicados = contatos.length - contatosFiltrados.length;

      if (!contatosFiltrados.length) {
        return res.status(200).json({ ok: false, error: 'Todos os contatos já receberam mensagem anteriormente.', duplicados });
      }

      const campRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ user_id: userId, nome, template, mensagem, total: contatosFiltrados.length, status: 'ativa' })
      });
      const campData = await campRes.json();
      const camp = campData[0];

      const contatosPayload = contatosFiltrados.map(c => ({
        campanha_id: camp.id,
        user_id: userId,
        nome: c.nome,
        telefone: c.telefone,
        mensagem: c.mensagem,
        status: 'pendente'
      }));

      await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(contatosPayload)
      });

      return res.status(200).json({
        ok: true,
        campanha_id: camp.id,
        total: contatosFiltrados.length,
        duplicados: duplicados,
        msg: duplicados > 0 ? `${duplicados} contato(s) ignorado(s) por já terem recebido mensagem.` : null
      });
    }

    // ── LISTAR CONTATOS PENDENTES ──
    if (action === 'listar_pendentes') {
      if (!campanha_id) return res.status(400).json({ error: 'campanha_id obrigatório' });
      const cRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?campanha_id=eq.${campanha_id}&status=eq.pendente&select=id,telefone,mensagem&order=created_at.asc`, {
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
      });
      const contatos = await cRes.json();
      return res.status(200).json({ ok: true, contatos: contatos || [] });
    }

    // ── ENVIAR UMA MENSAGEM POR VEZ ──
    if (action === 'enviar_um') {
      if (!campanha_id || !contato_id) return res.status(400).json({ error: 'Dados incompletos' });
      const cRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contato_id}&campanha_id=eq.${campanha_id}&select=*`, {
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
      });
      const cs = await cRes.json();
      const c = cs && cs[0];
      if (!c) return res.status(404).json({ error: 'Contato não encontrado' });

      const tel = c.telefone.replace(/[^0-9]/g, '');
      const telFull = tel.startsWith('55') ? tel : '55' + tel;

      const zapiRes = await fetch(`${ZAPI_URL}/send-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'client-token': ZAPI_CLIENT_TOKEN },
        body: JSON.stringify({ phone: telFull, message: c.mensagem })
      });
      const zapiData = await zapiRes.json();
      const sucesso = zapiRes.ok && !zapiData.error;

      await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contato_id}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sucesso ? 'enviada' : 'erro', enviado_em: new Date().toISOString() })
      });

      if (sucesso) {
        const campAtual = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}&select=enviadas`, {
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
        });
        const cd = await campAtual.json();
        await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${campanha_id}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ enviadas: ((cd[0] && cd[0].enviadas) || 0) + 1 })
        });
      }

      return res.status(200).json({ ok: sucesso, telefone: telFull });
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
      const sucesso = zapiRes.ok && !zapiData.error;
      return res.status(200).json({ ok: sucesso, error: zapiData.error });
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
