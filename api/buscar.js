const rateLimit = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;
  if (!rateLimit.has(ip)) { rateLimit.set(ip, { count: 1, start: now }); return true; }
  const data = rateLimit.get(ip);
  if (now - data.start > windowMs) { rateLimit.set(ip, { count: 1, start: now }); return true; }
  if (data.count >= maxRequests) return false;
  data.count++;
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://veracitytech.com.br');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const ip = req.headers['x-forwarded-for'] || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Muitas requisições. Aguarde 1 minuto.' });

  const CDD_KEY = '006a51b4658af302f4d83f9d40653599cb48728be1e18d6329358bb1add897955d80035df7feeb6e15d2395f284f40449dab49124329e2996d517f6dbebf01e8';

  try {
    const filtros = req.body;

    if (filtros.cnpj_avulso) {
      const cnpj = filtros.cnpj_avulso.replace(/[^0-9]/g, '');
      if (cnpj.length !== 14) return res.status(400).json({ error: 'CNPJ inválido' });
      const response = await fetch(`https://api.casadosdados.com.br/v4/cnpj/${cnpj}?tipo_resultado=completo`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'api-key': CDD_KEY }
      });
      const data = await response.json();
      return res.status(response.status).json({ cnpjs: [data], total: 1 });
    }

    const limite = Math.min(filtros.limite || 20, 500);
    const payload = {
      cnpj: [], cnpj_raiz: [],
      situacao_cadastral: filtros.situacao_cadastral || [],
      codigo_atividade_principal: filtros.codigo_atividade_principal || [],
      codigo_natureza_juridica: [],
      incluir_atividade_secundaria: false,
      bairro: filtros.bairro || [], cep: [],
      ddd: filtros.ddd || [], telefone: [],
      uf: filtros.uf || [], municipio: filtros.municipio || [],
      data_abertura: filtros.data_abertura || {},
      capital_social: { minimo: 0, maximo: 0 },
      mei: { optante: filtros.mei_optante || false, excluir_optante: filtros.mei_excluir || false },
      simples: { optante: false, excluir_optante: false },
      mais_filtros: {
        somente_matriz: false, somente_filial: false,
        com_email: filtros.com_email || false,
        com_telefone: filtros.com_telefone || false,
        somente_fixo: false,
        somente_celular: filtros.somente_celular || false,
        excluir_empresas_visualizadas: filtros.excluir_visualizadas || false,
        excluir_email_contab: false
      },
      limite, pagina: filtros.pagina || 1
    };

    if (filtros.texto) {
      payload.busca_textual = [{ texto: [filtros.texto], tipo_busca: "radical", razao_social: true, nome_fantasia: true, nome_socio: false }];
    }

    const response = await fetch('https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': CDD_KEY },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
