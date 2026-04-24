export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'POST') return res.status(200).end();

  const MP_TOKEN = 'APP_USR-4948794634485656-042321-0f0dfd855b835591a2527dad9db085fe-302827926';
  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_SERVICE_KEY = 'sb_secret_lMyRbUf84uDjmOBCJR1z_A_WNuKYotN';

  try {
    const body = req.body;
    console.log('Webhook MP recebido:', JSON.stringify(body));

    if (body.type !== 'payment') return res.status(200).json({ ok: true });

    const paymentId = body.data?.id;
    if (!paymentId) return res.status(200).json({ ok: true });

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_TOKEN}` }
    });

    const payment = await mpRes.json();
    console.log('Pagamento:', payment.status, payment.payer?.email, payment.transaction_amount);

    if (payment.status !== 'approved') return res.status(200).json({ ok: true });

    const valor = payment.transaction_amount;
    let plano = 'starter';
    let creditos = 500;

    if (valor >= 2997) { plano = 'enterprise'; creditos = 20000; }
    else if (valor >= 1497) { plano = 'scale'; creditos = 5000; }
    else if (valor >= 797) { plano = 'growth'; creditos = 2000; }
    else if (valor >= 397) { plano = 'starter'; creditos = 500; }

    const email = payment.payer?.email;
    console.log(`Pagamento aprovado: ${email} → plano ${plano}`);

    const userRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );

    const usersData = await userRes.json();
    const users = usersData.users || [];
    const user = users.find(u => u.email === email);

    if (user) {
      const profileRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`,
        {
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Accept': 'application/json'
          }
        }
      );
      const profiles = await profileRes.json();

      if (profiles && profiles.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ plan: plano, credits_total: creditos, credits_used: 0 })
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: user.id,
            email: email,
            name: user.user_metadata?.full_name || email,
            plan: plano,
            credits_total: creditos,
            credits_used: 0,
            exports: 0,
            created_at: new Date().toISOString()
          })
        });
      }
      console.log(`Plano ${plano} ativado para ${email}`);
    }

    return res.status(200).json({ ok: true });

  } catch(e) {
    console.error('Erro webhook:', e);
    return res.status(200).json({ ok: true });
  }
}
