export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).end();

  const MP_TOKEN = 'APP_USR-4948794634485656-042321-0f0dfd855b835591a2527dad9db085fe-302827926';
  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';

  // IDs dos planos recorrentes
  const PLANOS = {
    'd689f23a4ee84b75817752d0d134436c': { plano: 'enterprise', creditos: 5000 },
    '73428f86c4f34225af02b942c2c4ae21': { plano: 'scale',     creditos: 2500 },
    'fb10d4275b9240c5ad0129b1b3084531': { plano: 'growth',    creditos: 1000 },
    '205f08f4013444f597876e7bb55631e0': { plano: 'starter',   creditos: 300  },
  };

  // Packs avulsos por valor
  const PACKS = {
    97:  50,
    247: 150,
    397: 300,
  };

  try {
    const body = req.body;
    const tipo = body.type;

    if (tipo !== 'payment' && tipo !== 'subscription_preapproval') {
      return res.status(200).json({ ok: true });
    }

    let email = '';
    let plano = null;
    let creditos = 0;
    let isPack = false;

    if (tipo === 'payment') {
      const paymentId = body.data?.id;
      if (!paymentId) return res.status(200).json({ ok: true });

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
      });
      const payment = await mpRes.json();

      if (payment.status !== 'approved') return res.status(200).json({ ok: true });

      email = payment.payer?.email;
      const valor = Math.round(payment.transaction_amount);

      // Verifica se é pack avulso
      if (PACKS[valor]) {
        isPack = true;
        creditos = PACKS[valor];
      } else {
        // Pagamento único de plano — identifica pelo valor
        if (valor >= 2290) { plano = 'enterprise'; creditos = 5000; }
        else if (valor >= 1390) { plano = 'scale'; creditos = 2500; }
        else if (valor >= 797) { plano = 'growth'; creditos = 1000; }
        else { plano = 'starter'; creditos = 300; }
      }

    } else if (tipo === 'subscription_preapproval') {
      const subId = body.data?.id;
      if (!subId) return res.status(200).json({ ok: true });

      const subRes = await fetch(`https://api.mercadopago.com/preapproval/${subId}`, {
        headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
      });
      const sub = await subRes.json();

      if (sub.status !== 'authorized') return res.status(200).json({ ok: true });

      email = sub.payer_email;
      const planData = PLANOS[sub.preapproval_plan_id];
      if (planData) {
        plano = planData.plano;
        creditos = planData.creditos;
      }
    }

    if (!email) return res.status(200).json({ ok: true });

    // Busca usuário no Supabase
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const usersData = await userRes.json();
    const user = (usersData.users || []).find(u => u.email === email);

    if (!user) return res.status(200).json({ ok: true });

    // Busca perfil atual
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept': 'application/json'
      }
    });
    const profiles = await profileRes.json();
    const profile = profiles && profiles.length > 0 ? profiles[0] : null;

    let updateData = {};

    if (isPack) {
      // Pack avulso — SOMA créditos ao saldo atual, mantém o plano
      const totalAtual = profile ? (profile.credits_total || 0) : 0;
      const usadoAtual = profile ? (profile.credits_used || 0) : 0;
      updateData = {
        credits_total: totalAtual + creditos,
      };
    } else {
      // Assinatura — atualiza plano e reseta créditos
      updateData = {
        plan: plano,
        credits_total: creditos,
        credits_used: 0,
      };
    }

    if (profile) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: user.id,
          email,
          name: email,
          plan: plano || 'starter',
          credits_total: creditos,
          credits_used: 0,
          exports: 0,
          created_at: new Date().toISOString()
        })
      });
    }

    return res.status(200).json({ ok: true });

  } catch(e) {
    console.error('Erro webhook:', e);
    return res.status(200).json({ ok: true });
  }
}
