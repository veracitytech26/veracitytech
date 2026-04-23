export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const CDD_KEY = '006a51b4658af302f4d83f9d40653599cb48728be1e18d6329358bb1add897955d80035df7feeb6e15d2395f284f40449dab49124329e2996d517f6dbebf01e8';

  try {
    const filtros = req.body;

    const payload = {
      cnpj: [],
      cnpj_raiz: [],
      situacao_cadastral: filtros.situacao_cadastral || [],
      codigo_atividade_principal: filtros.codigo_atividade_principal || [],
      codigo_natureza_juridica: [],
      incluir_atividade_secundaria: false,
      bairro: filtros.bairro || [],
      cep: [],
      ddd: filtros.ddd || [],
      telefone: [],
      uf: filtros.uf || [],
      municipio: filtros.municipio || [],
      data_abertura: filtros.data_abertura || {},
      capital_social: { minimo: 0, maximo: 0 },
      mei: { optante: filtros.mei_optante || false, excluir_optante: filtros.mei_excluir || false },
      simples: { optante: false, excluir_optante: false },
      mais_filtros: {
        somente_matriz: false,
        somente_filial: false,
        com_email: filtros.com_email || false,
        com_telefone: filtros.com_telefone || false,
        somente_fixo: false,
        somente_celular: filtros.somente_celular || false,
        excluir_empresas_visualizadas: false,
        excluir_email_contab: false
      },
      limite: filtros.limite || 20,
      pagina: filtros.pagina || 1
    };

    if (filtros.texto) {
      payload.busca_textual = [{
        texto: [filtros.texto],
        tipo_busca: "radical",
        razao_social: true,
        nome_fantasia: true,
        nome_socio: false
      }];
    }

    const response = await fetch('https://api.casadosdados.com.br/v5/cnpj/pesquisa?tipo_resultado=completo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': CDD_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
