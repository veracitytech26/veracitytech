// ══════════════════════════════════════════════════════════════════════════════
// SMS MARKETING — Veracity Intelligence
// Arquivo: api/sms.js
// Integração com Infobip
// ══════════════════════════════════════════════════════════════════════════════

const INFOBIP_API_KEY  = process.env.INFOBIP_API_KEY;
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL;
const SUPABASE_URL     = 'https://nfusabwpxpdcqedrehrc.supabase.co';
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
const ZAPI_WHATSAPP    = '5521965307183';

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
      if (!telefone || !mensagem) return res.status(400).json({ error: 'Telefone e mensagem obrigatórios' });

      let tel = telefone.replace(/[^0-9]/g, '');
      if (!tel.startsWith('55')) tel = '55' + tel;

      const msg = mensagem.replace(/\{empresa\}/gi, nome_empresa || 'empresa');

      const smsRes = await fetch(`https://${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
        method: 'POST',
        headers: {
          'Authorization': `App ${INFOBIP_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          messages: [{
            destinations: [{ to: tel }],
            from: 'Veracity',
            text: msg
          }]
        })
      });

      const smsData = await smsRes.json();
      const ok = smsRes.ok && smsData.messages && smsData.messages[0].status.groupName !== 'REJECTED';

      return res.status(200).json({ ok, data: smsData });
    }

    // ── DISPARAR CAMPANHA DE SMS ───────────────────────────────────────────
    if (action === 'disparar_campanha') {
      const { contatos, mensagem, campanha_nome } = body;
      if (!contatos || !contatos.length) return res.status(400).json({ error: 'Nenhum contato' });

      let enviados = 0;
      let erros = 0;

      // Monta todos os destinatários em uma única chamada (batch)
      const destinations = [];
      contatos.forEach(function(c) {
        let tel = (c.telefone || c.whatsapp || '').replace(/[^0-9]/g, '');
        if (!tel || tel.length < 10) return;
        if (!tel.startsWith('55')) tel = '55' + tel;
        var msg = mensagem.replace(/\{empresa\}/gi, c.nome || c.empresa || 'empresa');
        destinations.push({ to: tel, messageText: msg });
      });

      if (!destinations.length) return res.status(400).json({ error: 'Nenhum número válido' });

      const smsRes = await fetch(`https://${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
        method: 'POST',
        headers: {
          'Authorization': `App ${INFOBIP_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          messages: [{
            destinations: destinations,
            from: 'Veracity',
            text: mensagem // fallback
          }]
        })
      });

      const smsData = await smsRes.json();

      if (smsRes.ok && smsData.messages) {
        smsData.messages.forEach(function(m) {
          if (m.status.groupName === 'REJECTED' || m.status.groupName === 'FAILED') erros++;
          else enviados++;
        });
      } else {
        erros = destinations.length;
      }

      return res.status(200).json({ ok: true, enviados, erros, total: destinations.length });
    }

    return res.status(400).json({ error: 'Action inválida' });

  } catch(e) {
    console.error('Erro SMS:', e);
    return res.status(500).json({ error: e.message });
  }
}
