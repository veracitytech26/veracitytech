const INFOBIP_API_KEY  = process.env.INFOBIP_API_KEY;
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL;
const SUPABASE_URL     = 'https://nfusabwpxpdcqedrehrc.supabase.co';
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';

async function enviarSMS(tel, msg) {
  let telFull = tel.replace(/[^0-9]/g, '');
  if (!telFull.startsWith('55')) telFull = '55' + telFull;
  const smsRes = await fetch(`https://${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
    method: 'POST',
    headers: { 'Authorization': `App ${INFOBIP_API_KEY}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ messages: [{ destinations: [{ to: telFull }], from: 'Veracity', text: msg }] })
  });
  const data = await smsRes.json();
  return smsRes.ok && data.messages && data.messages[0].status.groupName !== 'REJECTED';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action } = body;

    // ── ENVIAR UM SMS ──────────────────────────────────────────────────────
    if (action === 'enviar_um') {
      const { telefone, mensagem, nome_empresa } = body;
      if (!telefone || !mensagem) return res.status(400).json({ error: 'Telefone e mensagem obrigatorios' });
      const msg = mensagem.replace(/\{empresa\}/gi, nome_empresa || 'empresa');
      const ok = await enviarSMS(telefone, msg);
      return res.status(200).json({ ok });
    }

    // ── DISPARAR CAMPANHA ──────────────────────────────────────────────────
    if (action === 'disparar_campanha') {
      const { contatos, mensagem } = body;
      if (!contatos || !contatos.length) return res.status(400).json({ error: 'Nenhum contato' });

      // Busca números que já receberam SMS
      const jaEnviadosRes = await fetch(
        `${SUPABASE_URL}/rest/v1/sms_enviados?select=phone`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
      );
      const jaEnviados = jaEnviadosRes.ok ? (await jaEnviadosRes.json()) : [];
      const telefonesJaEnviados = new Set(jaEnviados.map(j => j.phone.replace(/[^0-9]/g, '')));

      // Filtra duplicados
      const contatosFiltrados = contatos.filter(function(c) {
        let tel = (c.telefone || c.whatsapp || '').replace(/[^0-9]/g, '');
        if (tel.startsWith('55') && tel.length > 11) tel = tel.slice(2);
        return tel && tel.length >= 10 && !telefonesJaEnviados.has(tel) && !telefonesJaEnviados.has('55' + tel);
      });

      const duplicados = contatos.length - contatosFiltrados.length;

      if (!contatosFiltrados.length) {
        return res.status(200).json({ ok: true, enviados: 0, erros: 0, total: 0, duplicados, msg: 'Todos ja receberam SMS anteriormente.' });
      }

      const destinations = contatosFiltrados.map(function(c) {
        let tel = (c.telefone || c.whatsapp || '').replace(/[^0-9]/g, '');
        if (!tel.startsWith('55')) tel = '55' + tel;
        var msg = mensagem.replace(/\{empresa\}/gi, c.nome || c.empresa || 'empresa');
        return { to: tel, messageText: msg, telLimpo: tel };
      });

      const smsRes = await fetch(`https://${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
        method: 'POST',
        headers: { 'Authorization': `App ${INFOBIP_API_KEY}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ messages: destinations.map(function(d) { return { destinations: [{ to: d.to }], from: 'Veracity', text: d.messageText }; }) })
      });

      const smsData = await smsRes.json();
      let enviados = 0, erros = 0;
      const telefonesEnviados = [];

      if (smsRes.ok && smsData.messages) {
        smsData.messages.forEach(function(m, idx) {
          if (m.status.groupName === 'REJECTED' || m.status.groupName === 'FAILED') {
            erros++;
          } else {
            enviados++;
            var tel = destinations[idx] ? destinations[idx].to.replace(/[^0-9]/g, '') : '';
            if (tel) telefonesEnviados.push(tel);
          }
        });
      } else {
        erros = destinations.length;
      }

      // Salva números enviados para evitar reenvio futuro
      if (telefonesEnviados.length) {
        await fetch(`${SUPABASE_URL}/rest/v1/sms_enviados`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates' },
          body: JSON.stringify(telefonesEnviados.map(function(p) { return { phone: p }; }))
        });
      }

      return res.status(200).json({ ok: true, enviados, erros, total: contatosFiltrados.length, duplicados });
    }

    return res.status(400).json({ error: 'Action invalida' });

  } catch(e) {
    console.error('Erro SMS:', e);
    return res.status(500).json({ error: e.message });
  }
}
