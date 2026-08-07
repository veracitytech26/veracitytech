export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPABASE_URL = 'https://nfusabwpxpdcqedrehrc.supabase.co';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const h = { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY, 'Accept': 'application/json' };

  try {
    const hoje = new Date().toISOString().split('T')[0];
    const ontem = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const inicioSemana = (() => {
      const d = new Date();
      const dia = d.getDay();
      const diff = dia === 0 ? 6 : dia - 1;
      d.setDate(d.getDate() - diff);
      return d.toISOString().split('T')[0];
    })();
    const limite2min = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const [rCRM, rCorretores, rLeads, rDisparos, rSDR, rVisitantes] = await Promise.all([
      fetch(SUPABASE_URL + '/rest/v1/crm_leads?select=id,status,empresa,corretor_id,data_criacao,valor_fechamento,corretores(nome)&order=data_criacao.desc', { headers: h }),
      fetch(SUPABASE_URL + '/rest/v1/corretores?select=id,nome', { headers: h }),
      fetch(SUPABASE_URL + '/rest/v1/leads_distribuidos?select=id&distribuido_em=gte.' + hoje + 'T00:00:00', { headers: h }),
      fetch(SUPABASE_URL + '/rest/v1/campanhas_api_oficial?select=id&enviado_em=gte.' + hoje + 'T00:00:00', { headers: h }),
      fetch(SUPABASE_URL + '/rest/v1/sdr_leads?select=id&updated_at=gte.' + hoje + 'T00:00:00', { headers: h }),
      fetch(SUPABASE_URL + '/rest/v1/visitantes_online?ultimo_ping=gte.' + limite2min + '&select=id', { headers: h })
    ]);

    const crm = rCRM.ok ? await rCRM.json() : [];
    const corretores = rCorretores.ok ? await rCorretores.json() : [];
    const leads = rLeads.ok ? await rLeads.json() : [];
    const disparos = rDisparos.ok ? await rDisparos.json() : [];
    const sdr = rSDR.ok ? await rSDR.json() : [];
    const visitantes = rVisitantes.ok ? await rVisitantes.json() : [];

    return res.status(200).json({
      ok: true,
      crm: Array.isArray(crm) ? crm : [],
      corretores: Array.isArray(corretores) ? corretores : [],
      leadsHoje: Array.isArray(leads) ? leads.length : 0,
      disparosHoje: Array.isArray(disparos) ? disparos.length : 0,
      sdrHoje: Array.isArray(sdr) ? sdr.length : 0,
      visitantes: Array.isArray(visitantes) ? visitantes.length : 0,
      hoje,
      ontem,
      inicioSemana
    });
  } catch (e) {
    return res.status(500).json({ ok: false, erro: e.message });
  }
}
