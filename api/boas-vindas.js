export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTEyOTUsImV4cCI6MjA5MjM4NzI5NX0.sUmFeXhXsx7D7BKPrKrXFHSVuqhFdIKgOCdfUQumECY';
  const RESEND_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY não configurada' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Não autorizado' });
    const token = authHeader.replace('Bearer ', '');

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Token inválido' });
    const userData = await userRes.json();

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const nome = body.nome || userData.email || 'Corretor';
    const email = userData.email || body.email;

    if (!email) return res.status(400).json({ error: 'Email não encontrado' });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#060C1A 0%,#0D1530 100%);padding:36px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-family:Arial Black,sans-serif;font-size:24px;color:#ffffff;letter-spacing:4px;font-weight:900;">VERACITY</div>
        <div style="font-size:10px;color:#00D4FF;letter-spacing:5px;font-weight:700;margin-top:2px;">INTELLIGENCE</div>
      </td>
      <td align="right">
        <div style="background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);color:#00D4FF;font-size:11px;font-weight:700;padding:6px 14px;letter-spacing:2px;">NOVO MEMBRO</div>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(90deg,#1240AB,#00D4FF);"></td></tr>

  <!-- BOAS VINDAS -->
  <tr><td style="padding:40px 40px 20px;">
    <div style="font-size:28px;font-weight:700;color:#060C1A;margin-bottom:8px;">Bem-vindo, ${nome.split(' ')[0]}!</div>
    <div style="font-size:16px;color:#555;line-height:1.6;margin-bottom:28px;">Sua conta foi criada com sucesso. Você agora tem acesso à plataforma de prospecção B2B mais completa para corretores do Brasil.</div>

    <!-- CREDITOS GRATIS -->
    <div style="background:linear-gradient(135deg,#060C1A,#0D1530);border-radius:8px;padding:24px;margin-bottom:28px;text-align:center;">
      <div style="font-size:12px;color:#00D4FF;letter-spacing:3px;font-weight:700;margin-bottom:8px;">SEU PLANO GRATUITO INCLUI</div>
      <div style="font-size:48px;font-weight:900;color:#ffffff;line-height:1;font-family:Arial Black,sans-serif;">10</div>
      <div style="font-size:14px;color:#8896B3;margin-top:4px;">consultas gratuitas para começar</div>
    </div>

    <!-- O QUE PODE FAZER -->
    <div style="font-size:14px;font-weight:700;color:#060C1A;letter-spacing:1px;margin-bottom:16px;text-transform:uppercase;">O que você pode fazer agora:</div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="50%" valign="top" style="padding-right:10px;padding-bottom:12px;">
          <div style="background:#f8f9fb;border-left:3px solid #00D4FF;padding:14px;">
            <div style="font-size:13px;font-weight:700;color:#060C1A;margin-bottom:4px;">Busca Avançada</div>
            <div style="font-size:12px;color:#666;">50M+ empresas com 20+ filtros</div>
          </div>
        </td>
        <td width="50%" valign="top" style="padding-left:10px;padding-bottom:12px;">
          <div style="background:#f8f9fb;border-left:3px solid #00D4FF;padding:14px;">
            <div style="font-size:13px;font-weight:700;color:#060C1A;margin-bottom:4px;">Radar de Aberturas</div>
            <div style="font-size:12px;color:#666;">Empresas abertas recentemente</div>
          </div>
        </td>
      </tr>
      <tr>
        <td width="50%" valign="top" style="padding-right:10px;padding-bottom:12px;">
          <div style="background:#f8f9fb;border-left:3px solid #1240AB;padding:14px;">
            <div style="font-size:13px;font-weight:700;color:#060C1A;margin-bottom:4px;">CRM Pipeline</div>
            <div style="font-size:12px;color:#666;">Gerencie seus leads</div>
          </div>
        </td>
        <td width="50%" valign="top" style="padding-left:10px;padding-bottom:12px;">
          <div style="background:#f8f9fb;border-left:3px solid #1240AB;padding:14px;">
            <div style="font-size:13px;font-weight:700;color:#060C1A;margin-bottom:4px;">Comparativo de Planos</div>
            <div style="font-size:12px;color:#666;">Propostas em PDF profissional</div>
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 40px 36px;text-align:center;">
    <a href="https://veracitytech.com.br/login.html" style="display:inline-block;background:#00D4FF;color:#060C1A;font-size:15px;font-weight:700;padding:16px 48px;border-radius:4px;text-decoration:none;letter-spacing:1px;">ACESSAR A PLATAFORMA</a>
    <div style="margin-top:16px;font-size:13px;color:#999;">Quer prospectar mais? <a href="https://veracitytech.com.br/#planos" style="color:#00D4FF;text-decoration:none;font-weight:600;">Veja nossos planos a partir de R$ 190/mês</a></div>
  </td></tr>

  <!-- SUPORTE -->
  <tr><td style="background:#f8f9fb;border-top:1px solid #eee;padding:24px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:13px;font-weight:700;color:#060C1A;margin-bottom:4px;">Precisa de ajuda?</div>
        <div style="font-size:12px;color:#666;">WhatsApp: (21) 97385-5107 · contato@veracitytech.com.br</div>
      </td>
      <td align="right">
        <div style="font-size:10px;color:#aaa;letter-spacing:2px;">VERACITY INTELLIGENCE</div>
        <div style="font-size:10px;color:#aaa;">veracitytech.com.br</div>
      </td>
    </tr></table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Veracity Intelligence <noreply@veracitytech.com.br>',
        to: [email],
        subject: `Bem-vindo à Veracity Intelligence, ${nome.split(' ')[0]}!`,
        html: html
      })
    });

    const emailData = await emailRes.json();
    if (emailRes.ok && emailData.id) {
      return res.status(200).json({ ok: true, message: 'Email de boas-vindas enviado!' });
    } else {
      return res.status(400).json({ error: emailData.message || 'Erro ao enviar' });
    }

  } catch(e) {
    console.error('Erro boas-vindas:', e);
    return res.status(500).json({ error: 'Erro interno: ' + e.message });
  }
}
