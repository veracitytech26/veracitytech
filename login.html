exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const CDD_KEY = '006a51b4658af302f4d83f9d40653599cb48728be1e18d6329358bb1add897955d80035df7feeb6e15d2395f284f40449dab49124329e2996d517f6dbebf01e8';

  try {
    const filtros = JSON.parse(event.body);

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

    const res = await fetch('https://api.casadosdados.com.br/v5/cnpj/pesquisa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': CDD_KEY
      },
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    console.log('CDD status:', res.status, 'body:', responseText.slice(0, 300));

    return {
      statusCode: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: responseText
    };

  } catch(e) {
    console.error('Erro:', e);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};
