// ══════════════════════════════════════════════════════════════════════════════
// NETLIFY FUNCTION: api/email-marketing.js
// Destino no repositório: api/email-marketing.js
//
// Variáveis de ambiente necessárias no Netlify:
//   SMTP_HOST  → smtp.gmail.com (ou outro servidor)
//   SMTP_PORT  → 587
//   SMTP_USER  → seu-email@gmail.com
//   SMTP_PASS  → senha de app do Gmail (não a senha normal)
//   SMTP_FROM  → "Seu Nome <seu-email@gmail.com>" (opcional)
//
// Para Gmail: ativar autenticação em 2 etapas e criar
// "Senha de app" em myaccount.google.com/apppasswords
// ══════════════════════════════════════════════════════════════════════════════

const nodemailer = require('nodemailer');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function criarTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false }
  });
}

function construirHtml(mensagem, assunto, telefone, nomeEmpresa, perfil) {
  const empresa      = nomeEmpresa || 'sua empresa';
  const msgFormatada = mensagem.replace(/\{empresa\}/gi, empresa).replace(/\n/g, '<br>');
  const tel          = ((telefone || '')).replace(/\D/g, '');
  const whatsLink    = tel ? `https://wa.me/55${tel}?text=Oi,%20vi%20seu%20email!` : 'https://wa.me/5521973855107';

  // Dados do corretor (passados pelo client)
  const p       = perfil || {};
  const nomeCor = p.nome_corretor || '';
  const creci   = p.creci   || '';
  const cor     = p.cor     || '#1240AB';
  const foto    = p.foto    || '';
  const avatar  = nomeCor ? nomeCor.charAt(0).toUpperCase() : 'C';

  // Header do corretor
  const headerCorr = nomeCor ? `
    <div style="background:linear-gradient(135deg,#060C1A,#0D1530);padding:16px 24px;display:flex;align-items:center;gap:14px;">
      ${foto
        ? `<img src="${foto}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid ${cor};flex-shrink:0;">`
        : `<div style="width:44px;height:44px;border-radius:50%;background:${cor};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0;">${avatar}</div>`
      }
      <div>
        <div style="font-size:14px;font-weight:700;color:#fff;">${nomeCor}</div>
        ${creci ? `<div style="font-size:11px;color:${cor};margin-top:2px;">CRECI: ${creci}</div>` : ''}
      </div>
    </div>` : `
    <div style="background:linear-gradient(135deg,#060C1A,#0D1530);padding:20px 28px;text-align:center;">
      <div style="font-size:11px;letter-spacing:4px;color:#00D4FF;font-weight:700;">PROPOSTA COMERCIAL</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${assunto}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-top:4px solid ${cor};">

    ${headerCorr}

    <div style="padding:28px 32px;color:#333;">
      <p style="font-size:15px;line-height:1.8;margin:0 0 24px;">${msgFormatada}</p>
    </div>

    <div style="padding:0 32px 32px;text-align:center;">
      <a href="${whatsLink}" target="_blank"
        style="display:inline-block;background:#25D366;color:#ffffff;font-size:16px;font-weight:700;
               padding:16px 40px;text-decoration:none;border-radius:4px;">
        Falar no WhatsApp
      </a>
    </div>

    <div style="background:#f8f9fc;padding:18px 32px;border-top:1px solid #e5e7ef;text-align:center;">
      <p style="font-size:11px;color:#999;margin:0;">
        Voce esta recebendo este email porque sua empresa foi identificada em nossa base.<br>
        Para nao receber mais, responda com "REMOVER".
      </p>
    </div>

  </div>
</body>
</html>`;
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  // Verificar configuração SMTP
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        error: 'SMTP não configurado. Adicione SMTP_USER e SMTP_PASS nas variáveis de ambiente do Netlify.'
      })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { action, dados } = body;

  // ── ENVIO AVULSO / TESTE ────────────────────────────────────────────────────
  if (action === 'enviar_avulso') {
    const { email, assunto, mensagem, telefone } = dados || {};

    if (!email || !email.includes('@')) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email inválido' }) };
    }
    if (!mensagem) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Mensagem vazia' }) };
    }

    try {
      const transporter = criarTransporter();
      const from = process.env.SMTP_FROM || process.env.SMTP_USER;
      const html = construirHtml(mensagem, assunto || 'Email de Teste', telefone, 'sua empresa', perfil);

      await transporter.sendMail({
        from:    from,
        to:      email,
        subject: assunto || 'Email de Teste',
        html:    html,
        text:    mensagem
      });

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ ok: true, enviado: email })
      };

    } catch (err) {
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({ error: 'Falha ao enviar: ' + err.message })
      };
    }
  }

  // ── ENVIO EM MASSA ──────────────────────────────────────────────────────────
  if (action === 'enviar') {
    const { assunto, mensagem, contatos, intervalo_segundos } = dados || {};

    if (!assunto || !mensagem) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Assunto e mensagem são obrigatórios' }) };
    }
    if (!contatos || !Array.isArray(contatos) || contatos.length === 0) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Nenhum contato informado' }) };
    }

    const intervalo = Math.max(3, Math.min(intervalo_segundos || 15, 60)) * 1000;
    const transporter = criarTransporter();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;

    let enviados = 0, erros = 0;
    const resultados = [];

    for (const contato of contatos) {
      try {
        const assuntoPersonalizado = (contato.assunto || assunto).replace(/\{empresa\}/gi, contato.nome || 'Empresa');
        const pf = { nome_corretor: dados.nome_corretor||'', creci: dados.creci||'', cor: dados.cor||'', foto: dados.foto||'' };
        const html = construirHtml(mensagem, assuntoPersonalizado, dados.telefone_corretor||dados.telefone||'', contato.nome, pf);

        await transporter.sendMail({
          from:    from,
          to:      contato.email,
          subject: assuntoPersonalizado,
          html:    html,
          text:    mensagem.replace(/\{empresa\}/gi, contato.nome || 'Empresa')
        });

        enviados++;
        resultados.push({ email: contato.email, ok: true });

        // Intervalo entre envios (evitar spam)
        if (contatos.indexOf(contato) < contatos.length - 1) {
          await sleep(intervalo);
        }

      } catch (err) {
        erros++;
        resultados.push({ email: contato.email, ok: false, erro: err.message });
      }
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        ok:       true,
        total:    contatos.length,
        enviados: enviados,
        erros:    erros,
        resultados: resultados
      })
    };
  }

  // Ação desconhecida
  return {
    statusCode: 400,
    headers: CORS,
    body: JSON.stringify({ error: 'Ação inválida. Use: enviar_avulso ou enviar' })
  };
};
