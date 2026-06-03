export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTEyOTUsImV4cCI6MjA5MjM4NzI5NX0.sUmFeXhXsx7D7BKPrKrXFHSVuqhFdIKgOCdfUQumECY';
  const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
  const RESEND_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY nao configurada.' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Nao autorizado' });
    const token = authHeader.replace('Bearer ', '');

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Token invalido' });
    const userData = await userRes.json();
    const userId = userData.id;
    if (!userId) return res.status(401).json({ error: 'Usuario nao encontrado' });

    const perfilRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
    });
    const perfis = await perfilRes.json();
    const perfil = perfis[0] || {};

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action, dados } = body;

    // Link do WhatsApp do Rodrigo (email) com mensagem pré-preenchida
    const WA_EMAIL = 'https://wa.me/5521973855107?text=Oi%2C+vi+a+oferta+de+Copa+e+quero+saber+mais';

    function montarHtml(nomeCorretor, creci, susep, whatsappCorretor, emailCorretor, fotoUrl, nomeEmpresa, mensagem) {
      const verdeEscuro = '#006400';
      const verdeBrasil = '#009C3B';
      const amarelo     = '#FFD700';
      const azul        = '#002776';

      const avatar = fotoUrl
        ? '<img src="' + fotoUrl + '" width="56" height="56" style="border-radius:50%;border:3px solid ' + amarelo + ';object-fit:cover;" alt="' + nomeCorretor + '">'
        : '<div style="width:56px;height:56px;border-radius:50%;background:' + verdeBrasil + ';text-align:center;line-height:56px;font-size:22px;font-weight:700;color:#fff;">' + (nomeCorretor||'C').charAt(0).toUpperCase() + '</div>';

      var registro = [];
      if (creci) registro.push('CRECI: ' + creci);
      if (susep)  registro.push('SUSEP: ' + susep);
      var registroStr = registro.join(' | ');

      var contatos = [];
      if (whatsappCorretor) contatos.push(whatsappCorretor);
      if (emailCorretor)    contatos.push(emailCorretor);
      var contatosStr = contatos.join('   ');

      // Botão animado pulsando nas cores do Brasil
      var botaoAnimado = '<a href="' + WA_EMAIL + '" target="_blank" '
        + 'style="display:inline-block;background:' + verdeBrasil + ';color:#ffffff;font-size:15px;font-weight:700;'
        + 'padding:16px 48px;border-radius:6px;text-decoration:none;border:3px solid ' + amarelo + ';'
        + 'animation:pulso 1.5s infinite;mso-hide:all;">'
        + 'Falar no WhatsApp'
        + '</a>';

      return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
        + '<style>'
        + '@keyframes pulso {'
        + '0%   { background-color: ' + verdeBrasil + '; border-color: ' + amarelo + '; transform: scale(1); }'
        + '50%  { background-color: ' + verdeEscuro + '; border-color: #ffffff; transform: scale(1.05); }'
        + '100% { background-color: ' + verdeBrasil + '; border-color: ' + amarelo + '; transform: scale(1); }'
        + '}'
        + 'a.btn-copa {'
        + 'display:inline-block;background:' + verdeBrasil + ';color:#ffffff;font-size:15px;font-weight:700;'
        + 'padding:16px 48px;border-radius:6px;text-decoration:none;border:3px solid ' + amarelo + ';'
        + 'animation:pulso 1.5s infinite;'
        + '}'
        + 'a.btn-copa:hover { background:' + verdeEscuro + '; }'
        + '</style>'
        + '</head>'
        + '<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:32px 0;">'
        + '<tr><td align="center">'
        + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.10);">'

        // Faixa Copa
        + '<tr><td style="background:' + verdeEscuro + ';padding:14px 32px;text-align:center;">'
        + '<div style="font-size:13px;font-weight:700;color:' + amarelo + ';letter-spacing:3px;">COPA DO MUNDO 2026</div>'
        + '<div style="font-size:11px;color:#ffffff;margin-top:2px;letter-spacing:1px;">CONDICAO ESPECIAL BRADESCO SAUDE</div>'
        + '</td></tr>'

        // Linha amarela
        + '<tr><td style="height:4px;background:' + amarelo + ';"></td></tr>'

        // Cabeçalho corretor
        + '<tr><td style="padding:24px 32px;border-bottom:1px solid #eee;">'
        + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td valign="middle" width="70">' + avatar + '</td>'
        + '<td valign="middle" style="padding-left:16px;">'
        + '<div style="font-size:17px;font-weight:700;color:#1a1a2e;">' + nomeCorretor + '</div>'
        + '<div style="font-size:12px;color:#555;margin-top:3px;">Especialista em Planos de Saude Empresariais</div>'
        + (registroStr ? '<div style="font-size:11px;color:#888;margin-top:3px;">' + registroStr + '</div>' : '')
        + '</td>'
        + '</tr></table>'
        + '</td></tr>'

        // Destaque oferta
        + '<tr><td style="background:#f9fff9;border-left:4px solid ' + verdeBrasil + ';padding:20px 32px;">'
        + '<div style="font-size:12px;font-weight:700;color:' + verdeEscuro + ';letter-spacing:1px;margin-bottom:6px;">OFERTA EXCLUSIVA — ATE 99 VIDAS</div>'
        + '<div style="font-size:20px;font-weight:700;color:' + verdeEscuro + ';">Primeira mensalidade por nossa conta</div>'
        + '<div style="font-size:13px;color:#555;margin-top:4px;">Valida durante o mes de Copa do Mundo</div>'
        + '</td></tr>'

        // Corpo
        + '<tr><td style="padding:28px 32px;">'
        + '<p style="font-size:15px;color:#1a1a2e;margin:0 0 16px 0;">Ola, <strong>' + nomeEmpresa + '</strong>!</p>'
        + '<div style="font-size:14px;color:#444;line-height:1.9;">' + mensagem.replace(/\n/g, '<br>') + '</div>'
        + '</td></tr>'

        // Botão animado
        + '<tr><td style="padding:0 32px 32px;text-align:center;">'
        + '<a href="' + WA_EMAIL + '" class="btn-copa" target="_blank">Falar no WhatsApp</a>'
        + '</td></tr>'

        // Linha azul
        + '<tr><td style="height:3px;background:' + azul + ';"></td></tr>'

        // Rodapé
        + '<tr><td style="background:#f8f9fb;padding:20px 32px;">'
        + '<div style="font-size:13px;font-weight:700;color:#1a1a2e;">' + nomeCorretor + '</div>'
        + '<div style="font-size:12px;color:#555;margin-top:2px;">Corretor de Saude Empresarial</div>'
        + (contatosStr ? '<div style="font-size:12px;color:#666;margin-top:4px;">' + contatosStr + '</div>' : '')
        + '</td></tr>'

        + '<tr><td style="padding:12px 32px;text-align:center;">'
        + '<p style="font-size:11px;color:#aaa;margin:0;">Para nao receber mais mensagens, responda com "Remover".</p>'
        + '</td></tr>'

        + '</table></td></tr></table></body></html>';
    }

    const nomeCorretor     = perfil.name  || 'Corretor';
    const creci            = perfil.creci || '';
    const susep            = perfil.susep || '';
    const whatsappCorretor = perfil.phone || '';
    const emailCorretor    = perfil.email || '';
    const fotoUrl          = perfil.foto_url || '';

    if (action === 'enviar_um') {
      const { email_destino, assunto, mensagem, nome_empresa } = dados;
      if (!email_destino || !assunto || !mensagem) {
        return res.status(400).json({ error: 'email_destino, assunto e mensagem sao obrigatorios' });
      }
      const nomeEmpresa = nome_empresa || 'Empresa';
      const mensagemP   = mensagem.replace(/\{empresa\}/gi, nomeEmpresa).replace(/\{nome\}/gi, nomeEmpresa);
      const htmlEmail   = montarHtml(nomeCorretor, creci, susep, whatsappCorretor, emailCorretor, fotoUrl, nomeEmpresa, mensagemP);
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: nomeCorretor + ' <noreply@veracitytech.com.br>',
          to: [email_destino],
          subject: assunto.replace(/\{empresa\}/gi, nomeEmpresa),
          html: htmlEmail,
          reply_to: emailCorretor || 'noreply@veracitytech.com.br'
        })
      });
      const emailData = await emailRes.json();
      if (emailRes.ok && emailData.id) {
        return res.status(200).json({ ok: true, id: emailData.id });
      } else {
        return res.status(400).json({ ok: false, error: emailData.message || 'Erro ao enviar' });
      }
    }

    if (action === 'salvar_metrica') {
      const { assunto, mensagem, total_contatos, total_enviados, total_erros } = dados;
      await fetch(`${SUPABASE_URL}/rest/v1/campanhas_email`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: userId, assunto, mensagem, total_contatos, total_enviados, total_erros })
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'enviar_avulso') {
      const email_destino = dados.email_destino || dados.email || '';
      const assunto       = dados.assunto       || '';
      const mensagem      = dados.mensagem      || '';
      if (!email_destino || !assunto || !mensagem) {
        return res.status(400).json({ error: 'Email, assunto e mensagem sao obrigatorios' });
      }
      const htmlEmail = montarHtml(nomeCorretor, creci, susep, whatsappCorretor, emailCorretor, fotoUrl, 'Cliente', mensagem);
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: nomeCorretor + ' <noreply@veracitytech.com.br>',
          to: [email_destino],
          subject: '[TESTE] ' + assunto,
          html: htmlEmail,
          reply_to: emailCorretor || 'noreply@veracitytech.com.br'
        })
      });
      const emailData = await emailRes.json();
      if (emailRes.ok && emailData.id) {
        return res.status(200).json({ ok: true, message: 'Email de teste enviado para ' + email_destino });
      } else {
        return res.status(400).json({ error: 'Erro ao enviar: ' + (emailData.message || 'Erro desconhecido') });
      }
    }

    if (action === 'verificar_creditos') {
      return res.status(200).json({ ok: true, email_credits: perfil.email_credits || 0 });
    }

    return res.status(400).json({ error: 'Acao invalida' });

  } catch(e) {
    console.error('Erro email-marketing:', e);
    return res.status(500).json({ error: 'Erro interno: ' + e.message });
  }
}
