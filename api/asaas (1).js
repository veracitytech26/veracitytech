export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTEyOTUsImV4cCI6MjA5MjM4NzI5NX0.sUmFeXhXsx7D7BKPrKrXFHSVuqhFdIKgOCdfUQumECY';
  const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
  const ASAAS_KEY = process.env.ASAAS_API_KEY;
  const ASAAS_URL = 'https://api.asaas.com/v3';

  if (!ASAAS_KEY) return res.status(500).json({ error: 'ASAAS_API_KEY não configurada' });

  try {
    // Valida usuário
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

    const perfilRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
    });
    const perfis = await perfilRes.json();
    const perfil = perfis && perfis[0];
    if (!perfil) return res.status(403).json({ error: 'Perfil não encontrado' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action, produto, cpf_cnpj } = body;

    const PRODUTOS = {
      'starter':        { valor: 190.00, descricao: 'Veracity Intelligence — Plano Starter (300 consultas/mês)' },
      'pro':            { valor: 279.00, descricao: 'Veracity Intelligence — Plano Pro (600 consultas/mês)' },
      'consultas_200':  { valor: 79.90,  descricao: 'Veracity Intelligence — Pacote 200 consultas' },
      'consultas_500':  { valor: 99.90,  descricao: 'Veracity Intelligence — Pacote 500 consultas' },
      'consultas_1000': { valor: 159.90, descricao: 'Veracity Intelligence — Pacote 1.000 consultas' },
      'email_1000':     { valor: 39.90,  descricao: 'Veracity Intelligence — Pacote 1.000 emails' },
      'email_5000':     { valor: 99.90,  descricao: 'Veracity Intelligence — Pacote 5.000 emails' },
      'email_10000':    { valor: 149.90, descricao: 'Veracity Intelligence — Pacote 10.000 emails' },
      'disparo':        { valor: 379.90, descricao: 'Veracity Intelligence — Veracity Disparo + SDR IA (WhatsApp em massa + atendimento automático)' },
    };

    const prod = PRODUTOS[produto];
    if (!prod) return res.status(400).json({ error: 'Produto inválido' });

    // ── BUSCA OU CRIA CLIENTE NO ASAAS ──
    if (action === 'gerar_pix') {
      const docNum = (cpf_cnpj || perfil.cpf_cnpj || '').replace(/[^0-9]/g, '');
      if (!docNum || docNum.length < 11) {
        return res.status(400).json({ error: 'CPF ou CNPJ obrigatório para gerar Pix' });
      }

      // Busca cliente no Asaas pelo CPF/CNPJ
      let asaasCustomerId = null;
      const buscaRes = await fetch(`${ASAAS_URL}/customers?cpfCnpj=${docNum}`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const buscaData = await buscaRes.json();

      if (buscaData.data && buscaData.data.length > 0) {
        asaasCustomerId = buscaData.data[0].id;
      } else {
        // Cria cliente no Asaas
        const criarRes = await fetch(`${ASAAS_URL}/customers`, {
          method: 'POST',
          headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: perfil.name || 'Cliente Veracity',
            email: perfil.email || '',
            cpfCnpj: docNum,
            phone: (perfil.phone || '').replace(/[^0-9]/g, ''),
            externalReference: userId
          })
        });
        const criarData = await criarRes.json();
        asaasCustomerId = criarData.id;
      }

      if (!asaasCustomerId) {
        return res.status(500).json({ error: 'Erro ao criar cliente no Asaas' });
      }

      // Gera cobrança Pix
      const vencimento = new Date();
      vencimento.setDate(vencimento.getDate() + 1);
      const vencStr = vencimento.toISOString().split('T')[0];

      const cobrancaRes = await fetch(`${ASAAS_URL}/payments`, {
        method: 'POST',
        headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: 'PIX',
          value: prod.valor,
          dueDate: vencStr,
          description: prod.descricao,
          externalReference: userId
        })
      });
      const cobrancaData = await cobrancaRes.json();

      if (!cobrancaData.id) {
        return res.status(500).json({ error: 'Erro ao gerar cobrança: ' + JSON.stringify(cobrancaData) });
      }

      // Busca QR Code Pix
      const pixRes = await fetch(`${ASAAS_URL}/payments/${cobrancaData.id}/pixQrCode`, {
        headers: { 'access_token': ASAAS_KEY }
      });
      const pixData = await pixRes.json();

      return res.status(200).json({
        ok: true,
        payment_id: cobrancaData.id,
        valor: prod.valor,
        descricao: prod.descricao,
        pix_copia_cola: pixData.payload,
        pix_qrcode: pixData.encodedImage,
        vencimento: vencStr
      });
    }

    return res.status(400).json({ error: 'Ação inválida' });

  } catch(e) {
    console.error('Erro asaas:', e);
    return res.status(500).json({ error: 'Erro interno: ' + e.message });
  }
}
