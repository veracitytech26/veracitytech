export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(200).end();

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SUPABASE_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';

  try {
    const body = req.body;
    console.log('Z-API Webhook:', JSON.stringify(body));

    // ── STATUS DE ENTREGA/LEITURA ──
    if (body.type === 'ReceivedCallback' || body.status) {
      const messageId = body.zaapId || body.id;
      const status = body.status; // SENT, DELIVERED, READ

      if (!messageId) return res.status(200).json({ ok: true });

      let updateData = {};
      if (status === 'DELIVERED' || status === '2') updateData.entregue = true;
      if (status === 'READ' || status === '3') { updateData.entregue = true; updateData.lida = true; }

      if (Object.keys(updateData).length > 0) {
        // Atualiza contato pelo message_id
        const contatoRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?message_id=eq.${messageId}&select=id,campanha_id,entregue,lida`, {
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
        });
        const contatos = await contatoRes.json();
        
        if (contatos && contatos[0]) {
          const contato = contatos[0];
          await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contato.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE,
              'Authorization': `Bearer ${SUPABASE_SERVICE}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
          });

          // Atualiza contadores na campanha
          if (contato.campanha_id) {
            const campRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}&select=entregues,lidas`, {
              headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
            });
            const camps = await campRes.json();
            if (camps && camps[0]) {
              const camp = camps[0];
              const campUpdate = {};
              if (updateData.entregue && !contato.entregue) campUpdate.entregues = (camp.entregues || 0) + 1;
              if (updateData.lida && !contato.lida) campUpdate.lidas = (camp.lidas || 0) + 1;
              if (Object.keys(campUpdate).length > 0) {
                await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contato.campanha_id}`, {
                  method: 'PATCH',
                  headers: {
                    'apikey': SUPABASE_SERVICE,
                    'Authorization': `Bearer ${SUPABASE_SERVICE}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(campUpdate)
                });
              }
            }
          }
        }
      }
    }

    // ── RESPOSTA RECEBIDA ──
    if (body.type === 'ReceivedCallback' && body.text && body.fromMe === false) {
      const phone = body.phone?.replace(/[^0-9]/g, '');
      const texto = body.text?.message || '';

      if (phone && texto) {
        // Busca contato pelo telefone
        const tel = phone.replace(/^55/, '');
        const contatoRes = await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?telefone=like.*${tel.slice(-8)}*&select=id,campanha_id`, {
          headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
        });
        const contatos = await contatoRes.json();

        if (contatos && contatos[0]) {
          // Marca como respondeu
          await fetch(`${SUPABASE_URL}/rest/v1/campanha_contatos?id=eq.${contatos[0].id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_SERVICE,
              'Authorization': `Bearer ${SUPABASE_SERVICE}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ respondeu: true, resposta: texto, status: 'respondeu' })
          });

          // Atualiza contador de respondidas na campanha
          if (contatos[0].campanha_id) {
            const campRes = await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contatos[0].campanha_id}&select=respondidas`, {
              headers: { 'apikey': SUPABASE_SERVICE, 'Authorization': `Bearer ${SUPABASE_SERVICE}` }
            });
            const camps = await campRes.json();
            if (camps && camps[0]) {
              await fetch(`${SUPABASE_URL}/rest/v1/campanhas?id=eq.${contatos[0].campanha_id}`, {
                method: 'PATCH',
                headers: {
                  'apikey': SUPABASE_SERVICE,
                  'Authorization': `Bearer ${SUPABASE_SERVICE}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ respondidas: (camps[0].respondidas || 0) + 1 })
              });
            }
          }
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch(e) {
    console.error('Erro webhook zapi:', e);
    return res.status(200).json({ ok: true });
  }
}
