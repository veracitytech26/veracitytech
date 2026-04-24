export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'POST') return res.status(200).end();

  const MP_TOKEN = 'APP_USR-4948794634485656-042321-0f0dfd855b835591a2527dad9db085fe-302827926';
  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_KEY = 'sb_secret_lMyRbUf84uDjmOBCJR1z_A_WNuKYotN';

  try {
    const body = req.body;
    console.log('Webhook recebido:', JSON.stringify(body));

    // Processa pagamentos e assinaturas
    const tipo = body.type;
    if (tipo !== 'payment' && tipo !== 'subscription_preapproval') {
      return res.status(200).json({ ok: true });
    }

    let email = '';
    let plano = 'starter';
    let creditos = 500;

    if (tipo === 'payment') {
      const paymentId = body.data?.id;
      if (!paymentId) return res.status(200).json({ ok: true });

      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
      });
      const payment = await mpRes.json();
      console.log('Pagamento:', payment.status, payment.payer?.email, payment.transaction_amount);
      if (payment.status !== 'approved') return res.status(200).json({ ok: true });

      email = payment.payer?.email;
      const valor = payment.transaction_amount;
      if (valor >= 2997) { plano = 'enterprise'; creditos = 20000; }
      else if (valor >= 1497) { plano = 'scale'; creditos = 5000; }
      else if (valor >= 797) { plano = 'growth'; creditos = 2000; }
      else { plano = 'starter'; creditos = 500; }

    } else if (tipo === 'subscription_preapproval') {
      const subId = body.data?.id;
      if (!subId) return res.status(200).json({ ok: true });

      const subRes = await fetch(`https://api.mercadopago.com/preapproval/${subId}`, {
        headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
      });
      const sub = await subRes.json();
      console.log('Assinatura:', sub.status, sub.payer_email, sub.preapproval_plan_id);
      if (sub.status !== 'authorized') return res.status(200).json({ ok: true });

      email = sub.payer_email;
      const planId = sub.preapproval_plan_id;

      // Identifica plano pelo ID
      if (planId === 'd689f23a4ee84b75817752d0d134436c') { plano = 'enterprise'; creditos = 20000; }
      else if (planId === '73428f86c4f34225af02b942c2c4ae21') { plano = 'scale'; creditos = 5000; }
      else if (planId === 'fb10d4275b9240c5ad0129b1b3084531') { plano = 'growth'; creditos = 2000; }
      else if (planId === '205f08f4013444f597876e7bb55631e0') { plano = 'starter'; creditos = 500; }
    }

    if (!email) return res.status(200).json({ ok: true });
    console.log(`Ativando plano ${plano} para ${email}`);

    // Busca usuário no Supabase
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    const usersData = await userRes.json();
    const user = (usersData.users || []).find(u => u.email === email);

    if (user) {
      const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept': 'application/json' }
      });
      const profiles = await profileRes.json();

      if (profiles && profiles.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: plano, credits_total: creditos, credits_used: 0 })
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: user.id, email, name: email, plan: plano, credits_total: creditos, credits_used: 0, exports: 0, created_at: new Date().toISOString() })
        });
      }
      console.log(`Plano ${plano} ativado para ${email}!`);
    } else {
      console.log(`Usuário ${email} não encontrado — será ativado no primeiro login`);
    }

    return res.status(200).json({ ok: true });
  } catch(e) {
    console.error('Erro webhook:', e);
    return res.status(200).json({ ok: true });
  }
}
