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
    const nomeCorretor     = perfil.name  || 'Corretor';
    const creci            = perfil.creci || '';
    const susep            = perfil.susep || '';
    const whatsappCorretor = (perfil.phone || '').replace(/[^0-9]/g, '');
    const emailCorretor    = perfil.email || '';
    const fotoUrl          = perfil.foto_url || '';
    const waLink = whatsappCorretor
      ? 'https://wa.me/55' + whatsappCorretor + '?text=Oi%2C+vi+o+email+sobre+o+beneficio+e+quero+saber+mais'
      : '';
    function montarHtml(nomeEmpresa, mensagem) {
      const azul        = '#0A1E3F';
      const azulClaro    = '#163B6E';
      const dourado      = '#B8862E';
      const douradoDeep  = '#96691F';
      const offWhite     = '#F7F9FC';
      const cinza        = '#64748B';
      const borda        = '#E1E7F0';
      const verde        = '#25D366';
      const avatar = fotoUrl
        ? '<img src="' + fotoUrl + '" width="52" height="52" style="border-radius:50%;border:2px solid ' + dourado + ';object-fit:cover;display:block;" alt="' + nomeCorretor + '">'
        : '<div style="width:52px;height:52px;border-radius:50%;background:' + azul + ';text-align:center;line-height:52px;font-size:20px;font-weight:700;color:#fff;">' + (nomeCorretor||'C').charAt(0).toUpperCase() + '</div>';
      var registro = [];
      if (creci) registro.push('CRECI: ' + creci);
      if (susep)  registro.push('SUSEP: ' + susep);
      var registroStr = registro.join(' | ');
      var contatos = [];
      if (whatsappCorretor) contatos.push(whatsappCorretor);
      if (emailCorretor)    contatos.push(emailCorretor);
      var contatosStr = contatos.join('   ');

      return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">'
        + '</head>'
        + '<body style="margin:0;padding:0;background:' + offWhite + ';font-family:Arial,Helvetica,sans-serif;">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + offWhite + ';padding:24px 0;">'
        + '<tr><td align="center">'
        + '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ' + borda + ';box-shadow:0 8px 32px rgba(10,30,63,0.08);">'

        // Barra de urgência
        + '<tr><td style="background:' + azul + ';padding:10px 24px;text-align:center;">'
        + '<span style="font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">OFERTA ENCERRA EM BREVE &mdash; </span>'
        + '<span style="font-size:11px;font-weight:800;color:' + dourado + ';">Beneficio reservado para sua empresa</span>'
        + '</td></tr>'

        // Header logo
        + '<tr><td style="padding:18px 24px;border-bottom:1px solid ' + borda + ';">'
        + '<div style="font-size:17px;font-weight:800;color:' + azul + ';letter-spacing:0.5px;">VERACITY <span style="color:' + dourado + ';">SEGUROS</span></div>'
        + '</td></tr>'

        // Hero
        + '<tr><td style="padding:32px 24px 20px;text-align:center;">'
        + '<div style="display:inline-block;background:' + azul + ';color:' + dourado + ';font-size:11px;font-weight:800;letter-spacing:1.5px;padding:8px 18px;border-radius:30px;margin-bottom:18px;text-transform:uppercase;">&#9733; SUA EMPRESA FOI CONTEMPLADA</div>'
        + '<div style="font-size:24px;font-weight:900;color:' + azul + ';line-height:1.25;margin-bottom:6px;">Beneficio liberado:</div>'
        + '<div style="font-size:30px;font-weight:900;color:' + douradoDeep + ';line-height:1.2;margin-bottom:14px;">1&ordf; Mensalidade<br>100% Gratuita</div>'
        + '<div style="font-size:14px;color:' + cinza + ';line-height:1.6;max-width:420px;margin:0 auto;">Sua empresa foi pre-aprovada para receber a primeira mensalidade do plano de saude empresarial sem nenhum custo. Confirme agora antes que o beneficio expire.</div>'
        + '</td></tr>'

        // Benefícios (badges)
        + '<tr><td style="padding:0 24px 24px;text-align:center;">'
        + '<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>'
        + '<td style="padding:4px;"><span style="display:inline-block;background:' + offWhite + ';border:1px solid ' + borda + ';padding:6px 12px;border-radius:20px;font-size:11px;color:' + azul + ';font-weight:600;">&#10003; Aprovacao imediata</span></td>'
        + '</tr><tr><td style="padding:4px;"><span style="display:inline-block;background:' + offWhite + ';border:1px solid ' + borda + ';padding:6px 12px;border-radius:20px;font-size:11px;color:' + azul + ';font-weight:600;">&#10003; Cobertura nacional</span></td>'
        + '</tr><tr><td style="padding:4px;"><span style="display:inline-block;background:' + offWhite + ';border:1px solid ' + borda + ';padding:6px 12px;border-radius:20px;font-size:11px;color:' + azul + ';font-weight:600;">&#10003; Ate 99 vidas</span></td>'
        + '</tr></table>'
        + '</td></tr>'

        // Card do corretor + mensagem personalizada
        + '<tr><td style="padding:0 24px 24px;">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + offWhite + ';border:1px solid ' + borda + ';border-radius:12px;">'
        + '<tr><td style="padding:20px;">'
        + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
        + '<td valign="middle" width="60">' + avatar + '</td>'
        + '<td valign="middle" style="padding-left:14px;">'
        + '<div style="font-size:14px;font-weight:700;color:' + azul + ';">' + nomeCorretor + '</div>'
        + '<div style="font-size:11px;color:' + cinza + ';margin-top:2px;">Especialista em Planos de Saude Empresariais</div>'
        + (registroStr ? '<div style="font-size:10px;color:#9AA6B8;margin-top:2px;">' + registroStr + '</div>' : '')
        + '</td></tr></table>'
        + '<div style="font-size:14px;color:#1A2332;margin-top:16px;line-height:1.7;">Ola, <strong>' + nomeEmpresa + '</strong>! ' + mensagem.replace(/\n/g, '<br>') + '</div>'
        + '</td></tr>'
        + '</table>'
        + '</td></tr>'

        // Botão CTA
        + (waLink
          ? '<tr><td style="padding:0 24px 8px;text-align:center;">'
          + '<a href="' + waLink + '" target="_blank" style="display:inline-block;width:100%;max-width:400px;background:' + verde + ';color:#ffffff;font-size:15px;font-weight:800;padding:16px 20px;border-radius:12px;text-decoration:none;box-sizing:border-box;">GARANTIR MEU BENEFICIO AGORA</a>'
          + '</td></tr>'
          + '<tr><td style="padding:0 24px 24px;text-align:center;">'
          + '<span style="font-size:10px;color:' + cinza + ';">&#128274; Seus dados estao seguros &middot; Sem compromisso</span>'
          + '</td></tr>'
          : '')

        // Prova social
        + '<tr><td style="padding:0 24px 28px;">'
        + '<table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(22,163,74,0.06);border:1px solid rgba(22,163,74,0.2);border-radius:10px;">'
        + '<tr><td style="padding:12px 16px;">'
        + '<span style="font-size:12px;color:#16A34A;font-weight:600;">&#10003; Mais de 200 empresas ja ativaram este beneficio este mes</span>'
        + '</td></tr></table>'
        + '</td></tr>'

        // Rodapé
        + '<tr><td style="background:' + offWhite + ';border-top:1px solid ' + borda + ';padding:18px 24px;text-align:center;">'
        + '<div style="font-size:11px;color:' + cinza + ';">Veracity Assessoria e Seguros &middot; SUSEP</div>'
        + (contatosStr ? '<div style="font-size:11px;color:' + cinza + ';margin-top:4px;">' + contatosStr + '</div>' : '')
        + '<div style="font-size:10px;color:#AAAAAA;margin-top:10px;">Para nao receber mais mensagens, responda com "Remover".</div>'
        + '</td></tr>'

        + '</table></td></tr></table></body></html>';
    }
    if (action === 'enviar_um') {
      const { email_destino, assunto, mensagem, nome_empresa } = dados;
      if (!email_destino || !assunto || !mensagem) {
        return res.status(400).json({ error: 'email_destino, assunto e mensagem sao obrigatorios' });
      }
      const nomeEmpresa = nome_empresa || 'Empresa';
      const mensagemP   = mensagem.replace(/\{empresa\}/gi, nomeEmpresa).replace(/\{nome\}/gi, nomeEmpresa);
      const htmlEmail   = montarHtml(nomeEmpresa, mensagemP);
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
      const htmlEmail = montarHtml('Cliente', mensagem);
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
