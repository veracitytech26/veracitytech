export default async function handler(req, res) {
 res.setHeader('Access-Control-Allow-Origin', '*');
 res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
 if (req.method === 'OPTIONS') return res.status(200).end();

 const SUPABASE_URL  = 'https://nfusabwpxpdcqedrehrc.supabase.co';
 const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mdXNhYndweHBkY3FlZHJlaHJjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjgxMTI5NSwiZXhwIjoyMDkyMzg3Mjk1fQ.iA7c0NPmLSkWe__qA8hLJnO3nD2Wwyvro5CKKez3UsI';
 const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID;
 const ZAPI_TOKEN    = process.env.ZAPI_TOKEN;
 const ZAPI_URL      = 'https://api.z-api.io/instances/' + ZAPI_INSTANCE + '/token/' + ZAPI_TOKEN;
 const CLIENT_TOKEN  = 'F74077534357d405ca497b01736c52b96S';

 const MSGS_FOLLOWUP = {
   1: 'Oi! Passei por aqui ontem mas nao vi sua resposta 😊 Ainda tenho aquela novidade especial de Copa para voce. Vale a pena conhecer!',
   2: 'Ultima chance! 🏆 Nossa condicao exclusiva no Bradesco encerra essa semana — primeira mensalidade por nossa conta. Posso te apresentar as opcoes?'
 };

 try {
   var agora = new Date();
   var horaBrasilia = agora.getUTCHours() - 3;
   if (horaBrasilia < 0) horaBrasilia += 24;
   if (horaBrasilia < 9 || horaBrasilia >= 18) {
     return res.status(200).json({ ok: true, msg: 'Fora do horario comercial', hora: horaBrasilia });
   }

   await fetch(`${SUPABASE_URL}/rest/v1/rpc/agendar_followups`, {
     method: 'POST',
     headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
     body: JSON.stringify({})
   });

   const fuRes = await fetch(
     `${SUPABASE_URL}/rest/v1/sdr_followup?enviado=eq.false&select=*&order=created_at.asc&limit=50`,
     { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
   );
   const followups = fuRes.ok ? (await fuRes.json()) : [];

   if (!followups.length) {
     return res.status(200).json({ ok: true, enviados: 0, msg: 'Nenhum follow-up pendente' });
   }

   var enviados = 0;
   var erros = 0;

   for (var i = 0; i < followups.length; i++) {
     var fu = followups[i];
     var msg = MSGS_FOLLOWUP[fu.tentativa] || MSGS_FOLLOWUP[1];
     var tel = fu.phone.replace(/[^0-9]/g, '');
     var telFull = tel.startsWith('55') ? tel : '55' + tel;

     try {
       var zapiRes = await fetch(ZAPI_URL + '/send-text', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'client-token': CLIENT_TOKEN },
         body: JSON.stringify({ phone: telFull, message: msg })
       });
       var zapiData = await zapiRes.json();
       var sucesso = zapiRes.ok && !zapiData.error;

       await fetch(`${SUPABASE_URL}/rest/v1/sdr_followup?id=eq.${fu.id}`, {
         method: 'PATCH',
         headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
         body: JSON.stringify({ enviado: sucesso, enviado_em: new Date().toISOString() })
       });

       if (sucesso) {
         enviados++;
         await fetch(`${SUPABASE_URL}/rest/v1/sdr_conversas`, {
           method: 'POST',
           headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
           body: JSON.stringify({ phone: telFull, role: 'assistant', content: msg, created_at: new Date().toISOString() })
         });
       } else {
         erros++;
       }

       if (i < followups.length - 1) {
         await new Promise(function(r) { setTimeout(r, 30000); });
       }
     } catch(e) {
       erros++;
     }
   }

   return res.status(200).json({ ok: true, enviados: enviados, erros: erros, total: followups.length });

 } catch(e) {
   console.error('Erro followup:', e);
   return res.status(500).json({ error: e.message });
 }
}
