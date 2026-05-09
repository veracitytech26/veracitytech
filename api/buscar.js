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
    // 1. Valida token do usuário
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const token = authHeader.replace('Bearer ', '');

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!userRes.ok) return res.status(401).json({ error: 'Token inválido' });

    const userData = await userRes.json();
    const userId = userData.id;
    if (!userId) return res.status(401).json({ error: 'Usuário não encontrado' });

    // 2. Busca perfil no SERVIDOR com service key
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: {
        'apikey': SUPABASE_SERVICE,
        'Authorization': `Bearer ${SUPABASE_SERVICE}`
      }
    });

    const profiles = await profileRes.json();
    const profile = profiles && profiles[0];

    if (!profile) return res.status(403).json({ error: 'Perfil não encontrado' });

    // 3. Verifica plano e créditos no SERVIDOR
    const plano = profile.plan || 'trial';
    const creditsTotal = profile.credits_total || 0;
    const creditsUsed = profile.credits_used || 0;
    const disponivel = creditsTotal - creditsUsed;

    if (plano === 'trial') {
      const criado = new Date(profile.created_at);
      const dias = Math.floor((new Date() - criado) / (1000 * 60 * 60 * 24));
      if (dias > 7) {
        return res.status(403).json({ error: 'Trial expirado', code: 'TRIAL_EXPIRED' });
      }
    }

    if (disponivel <= 0) {
      return res.status(403).json({ error: 'Sem créditos disponíveis', code: 'NO_CREDITS' });
    }

    // 4. Executa busca limitada pelos créditos disponíveis
    const body = req.body;
    body.limite = Math.min(body.limite || 20, disponivel);

    const casaRes = await fetch('https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': CASA_KEY
      },
      body: JSON.stringify(body)
    });

    const casaData = await casaRes.json();
    const qtdRetornada = (casaData.cnpjs || []).length;

    if (qtdRetornada > 0) {
      // 5. Desconta créditos no SERVIDOR — usuário não pode interferir
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

    return res.status(200).json(casaData);

  } catch(e) {
    console.error('Erro:', e);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
