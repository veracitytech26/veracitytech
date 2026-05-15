export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://veracitytech.com.br');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTEyOTUsImV4cCI6MjA5MjM4NzI5NX0.sUmFeXhXsx7D7BKPrKrXFHSVuqhFdIKgOCdfUQumECY';
  const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
  const RESEND_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY não configurada no Vercel.' });
  }

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

    // Busca perfil do corretor
    const perfilRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
    });
    const perfis = await perfilRes.json();
    const perfil = perfis[0] || {};

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action, dados } = body;

    // ── ENVIAR CAMPANHA ──
    if (action === 'enviar') {
      const { assunto, mensagem, contatos, intervalo_segundos } = dados;

      if (!assunto || !mensagem || !contatos || !contatos.length) {
        return res.status(400).json({ error: 'Dados incompletos' });
      }

      const nomeCorretor = perfil.name || 'Corretor';
      const whatsappCorretor = perfil.phone || '';
      const fotoUrl = perfil.foto_url || '';
      const creci = perfil.creci || '';
      const corPrincipal = perfil.cor_principal || '#00D4FF';

      const waNum = whatsappCorretor.replace(/[^0-9]/g, '');
      const waLink = waNum ? `https://wa.me/55${waNum}` : '';

      let enviados = 0;
      let erros = 0;
      const resultados = [];

      const delay = (ms) => new Promise(r => setTimeout(r, ms));

      for (const contato of contatos) {
        const emailDestino = contato.email;
        const nomeEmpresa = contato.nome || 'Empresa';

        if (!emailDestino || !emailDestino.includes('@')) {
          erros++;
          resultados.push({ email: emailDestino, ok: false, erro: 'Email inválido' });
          continue;
        }

        // Personaliza mensagem
        const mensagemPersonalizada = mensagem
          .replace(/\{empresa\}/gi, nomeEmpresa)
          .replace(/\{nome\}/gi, nomeEmpresa);

        // Monta HTML do email
        const htmlEmail = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${assunto}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#060C1A,#0D1530);padding:32px 40px;text-align:center;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="left" valign="middle" width="56">
                  ${fotoUrl
                    ? `<img src="${fotoUrl}" width="52" height="52" style="border-radius:50%;border:2px solid ${corPrincipal};object-fit:cover;" alt="${nomeCorretor}">`
                    : `<div style="width:52px;height:52px;border-radius:50%;background:${corPrincipal};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;text-align:center;line-height:52px;">${nomeCorretor.charAt(0).toUpperCase()}</div>`
                  }
                </td>
                <td align="left" valign="middle" style="padding-left:16px;">
                  <div style="font-size:16px;font-weight:700;color:#ffffff;margin-bottom:2px;">${nomeCorretor}</div>
                  ${creci ? `<div style="font-size:12px;color:${corPrincipal};">CRECI: ${creci}</div>` : ''}
                </td>
                <td align="right" valign="middle">
                  <div style="font-size:11px;color:#8896B3;letter-spacing:3px;font-weight:700;">VERACITY INTELLIGENCE</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- LINHA COLORIDA -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#1240AB,${corPrincipal});"></td></tr>

        <!-- CONTEÚDO -->
        <tr>
          <td style="padding:40px;">
            <p style="font-size:15px;color:#1a1a2e;margin-bottom:24px;">Olá, <strong>${nomeEmpresa}</strong>!</p>
            <div style="font-size:15px;color:#333;line-height:1.8;white-space:pre-wrap;">${mensagemPersonalizada.replace(/\n/g, '<br>')}</div>
          </td>
        </tr>

        <!-- BOTÃO WHATSAPP -->
        ${waLink ? `
        <tr>
          <td style="padding:0 40px 40px;text-align:center;">
            <a href="${waLink}" style="display:inline-block;background:#25D366;color:#ffffff;font-size:15px;font-weight:700;padding:16px 40px;border-radius:4px;text-decoration:none;letter-spacing:0.5px;">Falar no WhatsApp</a>
          </td>
        </tr>` : ''}

        <!-- RODAPÉ -->
        <tr>
          <td style="background:#f8f9fb;border-top:1px solid #eee;padding:24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:13px;font-weight:700;color:#1a1a2e;">${nomeCorretor}</div>
                  ${creci ? `<div style="font-size:12px;color:#666;margin-top:2px;">CRECI: ${creci}</div>` : ''}
                  ${whatsappCorretor ? `<div style="font-size:12px;color:#666;margin-top:2px;">${whatsappCorretor}</div>` : ''}
                </td>
                <td align="right">
                  <div style="font-size:10px;color:#aaa;letter-spacing:2px;">VERACITY INTELLIGENCE</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ANTI-SPAM -->
        <tr>
          <td style="padding:16px 40px;text-align:center;">
            <p style="font-size:11px;color:#aaa;margin:0;">Você recebeu este email pois sua empresa está cadastrada em bases públicas do Brasil. Para não receber mais mensagens, responda com "Remover".</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

        try {
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: `${nomeCorretor} <noreply@veracitytech.com.br>`,
              to: [emailDestino],
              subject: assunto,
              html: htmlEmail,
              reply_to: perfil.email || 'noreply@veracitytech.com.br'
            })
          });

          const emailData = await emailRes.json();

          if (emailRes.ok && emailData.id) {
            enviados++;
            resultados.push({ email: emailDestino, ok: true, id: emailData.id });
          } else {
            erros++;
            resultados.push({ email: emailDestino, ok: false, erro: emailData.message || 'Erro ao enviar' });
          }
        } catch (e) {
          erros++;
          resultados.push({ email: emailDestino, ok: false, erro: e.message });
        }

        // Delay entre envios
        const delayMs = (intervalo_segundos || 5) * 1000;
        if (contatos.indexOf(contato) < contatos.length - 1) {
          await delay(delayMs);
        }
      }

      return res.status(200).json({ ok: true, enviados, erros, total: contatos.length, resultados });
    }

    return res.status(400).json({ error: 'Ação inválida' });

  } catch (e) {
    console.error('Erro email-marketing:', e);
    return res.status(500).json({ error: 'Erro interno: ' + e.message });
  }
}
