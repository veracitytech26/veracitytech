export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://veracitytech.com.br');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const CASA_KEY = '006a51b4658af302f4d83f9d40653599cb48728be1e18d6329358bb1add897955d80035df7feeb6e15d2395f284f40449dab49124329e2996d517f6dbebf01e8';
  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTEyOTUsImV4cCI6MjA5MjM4NzI5NX0.sUmFeXhXsx7D7BKPrKrXFHSVuqhFdIKgOCdfUQumECY';
  const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const token = authHeader.replace('Bearer ', '');

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Token inválido' });
    const userData = await userRes.json();
    const userId = userData.id;
    if (!userId) return res.status(401).json({ error: 'Usuário não encontrado' });

    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
    });
    const profiles = await profileRes.json();
    const profile = profiles && profiles[0];
    if (!profile) return res.status(403).json({ error: 'Perfil não encontrado' });

    const plano = profile.plan || 'trial';
    const creditsTotal = profile.credits_total || 0;
    const creditsUsed = profile.credits_used || 0;
    const disponivel = creditsTotal - creditsUsed;

    if (plano === 'trial') {
      const dias = Math.floor((new Date() - new Date(profile.created_at)) / (1000 * 60 * 60 * 24));
      if (dias > 7) return res.status(403).json({ error: 'Trial expirado', code: 'TRIAL_EXPIRED' });
    }

    if (disponivel <= 0) {
      return res.status(403).json({ error: 'Sem créditos disponíveis', code: 'NO_CREDITS' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Consulta CNPJ avulso
    if (body.cnpj_avulso) {
      const cnpj = body.cnpj_avulso.replace(/[^0-9]/g, '');
      const r = await fetch('https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': CASA_KEY },
        body: JSON.stringify({ cnpj: [cnpj], limite: 1, pagina: 1 })
      });
      return res.status(200).json(await r.json());
    }

    // Monta payload limpo — remove arrays vazios e campos desnecessários
    const payload = {
      limite: Math.min(body.limite || 20, disponivel),
      pagina: body.pagina || 1
    };

    if (Array.isArray(body.situacao_cadastral) && body.situacao_cadastral.length > 0)
      payload.situacao_cadastral = body.situacao_cadastral;

    if (Array.isArray(body.codigo_atividade_principal) && body.codigo_atividade_principal.length > 0)
      payload.codigo_atividade_principal = body.codigo_atividade_principal;

    if (Array.isArray(body.uf) && body.uf.length > 0)
      payload.uf = body.uf;

    if (Array.isArray(body.municipio) && body.municipio.length > 0)
      payload.municipio = body.municipio;

    if (Array.isArray(body.bairro) && body.bairro.length > 0)
      payload.bairro = body.bairro;

    if (Array.isArray(body.ddd) && body.ddd.length > 0)
      payload.ddd = body.ddd;

    if (body.com_email === true) payload.com_email = true;
    if (body.com_telefone === true) payload.com_telefone = true;
    if (body.somente_celular === true) payload.somente_celular = true;
    if (body.mei_optante === true) payload.mei_optante = true;
    if (body.mei_excluir === true) payload.mei_excluir = true;

    if (body.texto && body.texto.trim()) payload.texto = body.texto.trim();

    if (body.data_abertura) {
      const da = {};
      if (body.data_abertura.inicio) da.inicio = body.data_abertura.inicio;
      if (body.data_abertura.fim) da.fim = body.data_abertura.fim;
      if (Object.keys(da).length > 0) payload.data_abertura = da;
    }

    if (body.capital_social_min && body.capital_social_min > 0) {
      payload.capital_social = { min: body.capital_social_min };
    }

    console.log('Payload:', JSON.stringify(payload));

    const casaRes = await fetch('https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': CASA_KEY },
      body: JSON.stringify(payload)
    });

    if (!casaRes.ok) {
      const errText = await casaRes.text();
      console.error('Casa dos Dados erro:', casaRes.status, errText);
      return res.status(502).json({ error: 'Erro na API de dados: ' + casaRes.status, detalhe: errText });
    }

    const casaData = await casaRes.json();
    let cnpjs = casaData.cnpjs || [];

    // ── FILTRO NO SERVIDOR ──
    // Se o corretor pediu com_email, garante que só vêm empresas com email válido
    if (payload.com_email) {
      cnpjs = cnpjs.filter(function(e) {
        var emails = e.contato_email || [];
        return emails.some(function(em) {
          var email = (em.email || em.contato || '').trim();
          return email && email.includes('@') && email.includes('.');
        });
      });
    }

    // Se o corretor pediu somente_celular, garante que só vêm empresas com celular válido
    if (payload.somente_celular) {
      cnpjs = cnpjs.filter(function(e) {
        var tels = e.contato_telefonico || [];
        return tels.some(function(t) {
          var num = (t.ddd || '') + (t.telefone || t.numero || '');
          num = num.replace(/[^0-9]/g, '');
          // Celular: 11 dígitos com DDD, 9º dígito = 9
          return num.length === 11 && num[2] === '9';
        });
      });
    }

    // Se pediu com_telefone (qualquer telefone), garante que tem telefone
    if (payload.com_telefone && !payload.somente_celular) {
      cnpjs = cnpjs.filter(function(e) {
        var tels = e.contato_telefonico || [];
        return tels.some(function(t) {
          var num = (t.telefone || t.numero || '').replace(/[^0-9]/g, '');
          return num.length >= 8;
        });
      });
    }

    const qtdRetornada = cnpjs.length;

    if (qtdRetornada > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE,
          'Authorization': `Bearer ${SUPABASE_SERVICE}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ credits_used: creditsUsed + qtdRetornada })
      });
    }

    return res.status(200).json({ ...casaData, cnpjs });

  } catch(e) {
    console.error('Erro buscar.js:', e.message, e.stack);
    return res.status(500).json({ error: 'Erro interno', detalhe: e.message });
  }
}
