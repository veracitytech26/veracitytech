export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTEyOTUsImV4cCI6MjA5MjM4NzI5NX0.sUmFeXhXsx7D7BKPrKrXFHSVuqhFdIKgOCdfUQumECY';
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM = 'whatsapp:+552123915707';

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Nao autorizado' });
  const token = authHeader.replace('Bearer ', '');

  if (token !== SERVICE_KEY) {
    try {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` }
      });
      if (!userRes.ok) return res.status(401).json({ error: 'Token invalido' });
    } catch(e) {
      return res.status(401).json({ error: 'Erro de autenticacao' });
    }
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch(e) {
    return res.status(400).json({ error: 'Body invalido' });
  }

  const action = body && body.action;

  if (action === 'listar_templates') {
    try {
      const authStr = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      const twilioRes = await fetch('https://content.twilio.com/v1/Content?PageSize=50', {
        headers: { 'Authorization': `Basic ${authStr}` }
      });
      const twilioData = await twilioRes.json();
      const contents = Array.isArray(twilioData.contents) ? twilioData.contents : [];

      const templates = contents.map(function(t) {
        var aprov = t.approvals && t.approvals.whatsapp ? t.approvals.whatsapp : {};
        var bodyText = '';
        if (t.types) {
          if (t.types['twilio/card']) bodyText = t.types['twilio/card'].body || '';
          else if (t.types['twilio/text']) bodyText = t.types['twilio/text'].body || '';
        }
        return {
          sid: t.sid || '',
          nome: t.friendly_name || '',
          status: aprov.status || 'unknown',
          categoria: aprov.category || 'Marketing',
          body: bodyText
        };
      });

      return res.status(200).json({ ok: true, templates: templates, total: contents.length });
    } catch(e) {
      return res.status(500).json({ error: 'Erro Twilio: ' + e.message });
    }
  }

  if (action === 'enviar_um') {
    try {
      var telefone = body.telefone || '';
      var nome = body.nome || 'Cliente';
      var empresa = body.empresa || 'Empresa';
      var template_sid = body.template_sid || '';
      var campanha_id = body.campanha_id || null;

      if (!telefone || !template_sid) return res.status(400).json({ error: 'Telefone e template_sid obrigatorios' });

      var telLimpo = telefone.replace(/[^0-9]/g, '');
      if (!telLimpo.startsWith('55')) telLimpo = '55' + telLimpo;

      const authStr = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      const params = new URLSearchParams({
        From: TWILIO_FROM,
        To: 'whatsapp:+' + telLimpo,
        ContentSid: template_sid,
        ContentVariables: JSON.stringify({ '1': nome, '2': empresa })
      });

      const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${authStr}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      const twilioData = await twilioRes.json();

      await fetch(`${SUPABASE_URL}/rest/v1/campanhas_api_oficial`, {
        method: 'POST',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campanha_id: campanha_id,
          telefone: telLimpo,
          nome: nome,
          empresa: empresa,
          template_sid: template_sid,
          status: twilioRes.ok ? 'enviado' : 'falhou',
          twilio_sid: twilioData.sid || null,
          enviado_em: new Date().toISOString()
        })
      });

      if (!twilioRes.ok) return res.status(400).json({ ok: false, error: twilioData.message || 'Erro ao enviar' });
      return res.status(200).json({ ok: true, sid: twilioData.sid, status: twilioData.status });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'historico') {
    try {
      const histRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas_api_oficial?order=enviado_em.desc&limit=200`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
      });
      const hist = histRes.ok ? await histRes.json() : [];
      return res.status(200).json({ ok: true, historico: Array.isArray(hist) ? hist : [] });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Acao invalida' });
}
