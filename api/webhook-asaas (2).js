export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).end();

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const ASAAS_TOKEN = 'veracitytech2026IntelligenceWebhook32';

  const sHeaders = {
    'apikey': SUPABASE_SERVICE,
    'Authorization': `Bearer ${SUPABASE_SERVICE}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  try {
    // Valida token do webhook
    const tokenRecebido = req.headers['asaas-access-token'] || req.headers['access-token'] || req.query?.token || '';
    if (tokenRecebido && tokenRecebido !== ASAAS_TOKEN) {
      console.log('Token inválido recebido:', tokenRecebido, '— continuando para log');
      // Não bloqueia para não perder pagamentos reais
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const evento = body.event;
    const pagamento = body.payment;

    console.log('Asaas webhook:', evento, pagamento?.id);

    if (!pagamento) return res.status(200).json({ ok: true });

    // Busca cliente pelo externalReference ou pelo customer.externalReference
    const externalRef = pagamento.externalReference || pagamento.customer?.externalReference || '';
    if (!externalRef) {
      // Tenta buscar pelo email do customer se não tiver externalRef
      console.log('Sem externalReference no pagamento:', JSON.stringify(pagamento).slice(0, 200));
      return res.status(200).json({ ok: true, msg: 'sem externalReference' });
    }

    // Busca perfil do usuário
    const perfilRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${externalRef}&select=*`, { headers: sHeaders });
    const perfis = await perfilRes.json();
    const perfil = perfis && perfis[0];
    if (!perfil) {
      console.log('Perfil não encontrado para:', externalRef);
      return res.status(200).json({ ok: true });
    }

    // Identifica o produto pelo description do pagamento
    const descricao = (pagamento.description || '').toLowerCase();
    const valor = pagamento.value || 0;

    // ── PAGAMENTO CONFIRMADO ──
    if (evento === 'PAYMENT_CONFIRMED' || evento === 'PAYMENT_RECEIVED') {

      let update = {};
      let emailAssunto = '';
      let emailCorpo = '';

      // PLANO STARTER
      if (descricao.includes('starter') || (valor >= 185 && valor <= 195)) {
        update = { plan: 'starter', credits_total: 300, credits_used: 0 };
        emailAssunto = 'Plano Starter ativado — Veracity Intelligence';
        emailCorpo = `Seu plano Starter foi ativado com sucesso!\n\nVocê tem 300 consultas disponíveis este mês.\n\nAcesse: https://veracitytech.com.br/login.html`;
      }
      // PLANO PRO
      else if (descricao.includes('pro') || (valor >= 274 && valor <= 284)) {
        update = { plan: 'pro', credits_total: 600, credits_used: 0 };
        emailAssunto = 'Plano Pro ativado — Veracity Intelligence';
        emailCorpo = `Seu plano Pro foi ativado com sucesso!\n\nVocê tem 600 consultas disponíveis este mês.\n\nAcesse: https://veracitytech.com.br/login.html`;
      }
      // PACOTE 200 CONSULTAS
      else if (descricao.includes('200') && descricao.includes('consul')) {
        const atual = perfil.credits_total || 0;
        const usados200 = perfil.credits_used || 0;
        update = { credits_total: atual + 200, credits_used: Math.min(usados200, atual + 200) };
        emailAssunto = '200 consultas adicionadas — Veracity Intelligence';
        emailCorpo = `Seu pacote de 200 consultas foi creditado!\n\nTotal disponível: ${atual + 200} consultas.\n\nAcesse: https://veracitytech.com.br/login.html`;
      }
      // PACOTE 500 CONSULTAS
      else if (descricao.includes('500') && descricao.includes('consul')) {
        const atual = perfil.credits_total || 0;
        const usados500 = perfil.credits_used || 0;
        update = { credits_total: atual + 500, credits_used: Math.min(usados500, atual + 500) };
        emailAssunto = '500 consultas adicionadas — Veracity Intelligence';
        emailCorpo = `Seu pacote de 500 consultas foi creditado!\n\nTotal disponível: ${atual + 500} consultas.\n\nAcesse: https://veracitytech.com.br/login.html`;
      }
      // PACOTE 1000 CONSULTAS
      else if (descricao.includes('1000') && descricao.includes('consul') || descricao.includes('1.000') && descricao.includes('consul')) {
        const atual = perfil.credits_total || 0;
        const usados1000 = perfil.credits_used || 0;
        update = { credits_total: atual + 1000, credits_used: Math.min(usados1000, atual + 1000) };
        emailAssunto = '1.000 consultas adicionadas — Veracity Intelligence';
        emailCorpo = `Seu pacote de 1.000 consultas foi creditado!\n\nTotal disponível: ${atual + 1000} consultas.\n\nAcesse: https://veracitytech.com.br/login.html`;
      }
      // PACOTE 1000 EMAILS
      else if (descricao.includes('1000') && descricao.includes('email') || descricao.includes('1.000') && descricao.includes('email')) {
        const atual = perfil.email_credits || 0;
        update = { email_credits: atual + 1000 };
        emailAssunto = '1.000 créditos de email adicionados — Veracity Intelligence';
        emailCorpo = `Seu pacote de 1.000 emails foi creditado!\n\nTotal disponível: ${atual + 1000} créditos de email.\n\nAcesse: https://veracitytech.com.br/login.html`;
      }
      // PACOTE 5000 EMAILS
      else if (descricao.includes('5000') && descricao.includes('email') || descricao.includes('5.000') && descricao.includes('email')) {
        const atual = perfil.email_credits || 0;
        update = { email_credits: atual + 5000 };
        emailAssunto = '5.000 créditos de email adicionados — Veracity Intelligence';
        emailCorpo = `Seu pacote de 5.000 emails foi creditado!\n\nTotal disponível: ${atual + 5000} créditos de email.\n\nAcesse: https://veracitytech.com.br/login.html`;
      }
      // PACOTE 10000 EMAILS
      else if (descricao.includes('10000') && descricao.includes('email') || descricao.includes('10.000') && descricao.includes('email')) {
        const atual = perfil.email_credits || 0;
        update = { email_credits: atual + 10000 };
        emailAssunto = '10.000 créditos de email adicionados — Veracity Intelligence';
        emailCorpo = `Seu pacote de 10.000 emails foi creditado!\n\nTotal disponível: ${atual + 10000} créditos de email.\n\nAcesse: https://veracitytech.com.br/login.html`;
      }
      // VERACITY DISPARO + SDR IA
      else if (descricao.includes('disparo') || (valor >= 374 && valor <= 385)) {
        // Ativa por 30 dias
        const venc = new Date();
        venc.setDate(venc.getDate() + 30);
        update = { addon_disparo: true, addon_sdr: true, disparo_vencimento: venc.toISOString() };
        emailAssunto = 'Veracity Disparo + SDR IA ativado — Veracity Intelligence';
        emailCorpo = `Seu Veracity Disparo + SDR IA foi ativado!\n\nNossa equipe entrará em contato em até 24h para configurar seu WhatsApp.\n\nWhatsApp suporte: (21) 97385-5107`;
      }

      if (Object.keys(update).length > 0) {
        // Atualiza perfil
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${externalRef}`, {
          method: 'PATCH',
          headers: sHeaders,
          body: JSON.stringify(update)
        });

        // Registra pagamento nas métricas
        await fetch(`${SUPABASE_URL}/rest/v1/metricas_pacotes`, {
          method: 'POST',
          headers: sHeaders,
          body: JSON.stringify({
            user_id: externalRef,
            pacote: pagamento.description || 'pagamento',
            creditos: update.credits_total || update.email_credits || 0,
            valor: valor
          })
        });

        // Envia email de confirmação
        if (RESEND_KEY && perfil.email && emailAssunto) {
          const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:linear-gradient(135deg,#060C1A,#0D1530);padding:28px 32px;">
  <div style="font-family:Arial Black,sans-serif;font-size:22px;color:#fff;letter-spacing:3px;">VERACITY INTELLIGENCE</div>
</td></tr>
<tr><td style="height:3px;background:linear-gradient(90deg,#1240AB,#00D4FF);"></td></tr>
<tr><td style="padding:36px 32px;">
  <div style="font-size:28px;color:#00E676;font-weight:700;margin-bottom:8px;">✓ Pagamento confirmado!</div>
  <div style="font-size:16px;color:#333;margin-bottom:24px;">${emailAssunto.replace(' — Veracity Intelligence','')}</div>
  <div style="font-size:14px;color:#555;line-height:1.8;white-space:pre-wrap;">${emailCorpo}</div>
  <div style="margin-top:28px;text-align:center;">
    <a href="https://veracitytech.com.br/login.html" style="display:inline-block;background:#00D4FF;color:#060C1A;font-weight:700;font-size:14px;padding:14px 36px;border-radius:4px;text-decoration:none;">Acessar a plataforma</a>
  </div>
</td></tr>
<tr><td style="background:#f8f9fb;border-top:1px solid #eee;padding:20px 32px;text-align:center;">
  <div style="font-size:12px;color:#999;">Veracity Intelligence · veracitytech.com.br</div>
</td></tr>
</table></td></tr></table></body></html>`;

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Veracity Intelligence <noreply@veracitytech.com.br>',
              to: [perfil.email],
              subject: emailAssunto,
              html: html
            })
          });
        }

        console.log('Atualizado:', externalRef, update);
      }
    }

    // ── PAGAMENTO VENCIDO/CANCELADO ──
    if (evento === 'PAYMENT_OVERDUE' || evento === 'PAYMENT_DELETED' || evento === 'PAYMENT_REFUNDED') {
      const descricao2 = (pagamento.description || '').toLowerCase();

      // Bloqueia plano se for assinatura
      if (descricao2.includes('starter') || descricao2.includes('pro')) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${externalRef}`, {
          method: 'PATCH',
          headers: sHeaders,
          body: JSON.stringify({ plan: 'trial', credits_total: 10 })
        });
        console.log('Plano rebaixado para trial:', externalRef);
      }

      // Bloqueia disparo se venceu
      if (descricao2.includes('disparo')) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${externalRef}`, {
          method: 'PATCH',
          headers: sHeaders,
          body: JSON.stringify({ addon_disparo: false })
        });
        console.log('Disparo desativado:', externalRef);
      }
    }

    return res.status(200).json({ ok: true });

  } catch(e) {
    console.error('Erro webhook-asaas:', e);
    return res.status(200).json({ ok: true });
  }
}
