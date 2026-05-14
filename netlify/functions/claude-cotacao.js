// ══════════════════════════════════════════════════════════════════════════════
// NETLIFY FUNCTION: claude-cotacao.js
// Destino no repositório: netlify/functions/claude-cotacao.js
//
// Esta função recebe PDFs de cotação, envia para a API Claude e retorna
// os planos extraídos em formato JSON estruturado.
//
// Configuração necessária no Netlify:
//   Site settings → Environment variables → Add variable:
//   Nome:  ANTHROPIC_KEY
//   Valor: sk-ant-api03-... (sua chave da API Anthropic)
// ══════════════════════════════════════════════════════════════════════════════

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const PROMPT_EXTRACAO = `Você está analisando uma cotação de plano de saúde empresarial brasileira.

Extraia TODOS os planos disponíveis e retorne APENAS um JSON válido, sem texto adicional, sem markdown, sem blocos de código.

Estrutura obrigatória:
{
  "operadora": "Nome completo da operadora",
  "planos": [
    {
      "nome": "Nome exato do plano",
      "coparticipacao": "Sim" ou "Não",
      "acomodacao": "Enfermaria" ou "Apartamento" ou "Ambulatorial",
      "abrangencia": "Municipal" ou "Estadual" ou "Nacional",
      "faixas": {
        "0-18": valor numérico ou null,
        "19-23": valor numérico ou null,
        "24-28": valor numérico ou null,
        "29-33": valor numérico ou null,
        "34-38": valor numérico ou null,
        "39-43": valor numérico ou null,
        "44-48": valor numérico ou null,
        "49-53": valor numérico ou null,
        "54-58": valor numérico ou null,
        "59+": valor numérico ou null
      },
      "rede_resumo": "principais hospitais e clínicas separados por vírgula (máx 300 chars)"
    }
  ]
}

REGRAS IMPORTANTES:
- Valores das faixas devem ser números (ex: 250.50), não strings
- Se uma faixa etária não existe no plano, use null
- Extraia TODOS os planos listados, sem omitir nenhum
- Para abrangência: "Nacional" se cobrir múltiplos estados, "Estadual" para um estado, "Municipal" para uma cidade
- Para coparticipação: "Sim" se o plano tiver coparticipação (QP), "Não" se não tiver (QC)`;

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: 'ANTHROPIC_KEY não configurada. Vá em Netlify → Site settings → Environment variables e adicione a variável ANTHROPIC_KEY com sua chave da API Anthropic.'
      })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { pdfs } = body;
  if (!pdfs || !Array.isArray(pdfs) || pdfs.length === 0) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Nenhum PDF enviado' }) };
  }

  const results = [];

  for (const pdf of pdfs) {
    try {
      const response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdf.base64
                }
              },
              {
                type: 'text',
                text: PROMPT_EXTRACAO
              }
            ]
          }]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        results.push({
          error: `Erro API (${response.status}): ${data.error?.message || 'Erro desconhecido'}`,
          arquivo: pdf.name
        });
        continue;
      }

      // Extract text from response
      const text = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      // Clean and parse JSON
      const clean = text
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      try {
        const parsed = JSON.parse(clean);
        results.push({
          ...parsed,
          arquivo: pdf.name,
          ok: true
        });
      } catch (parseErr) {
        // Try to extract JSON from the text if it has extra content
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            results.push({ ...parsed, arquivo: pdf.name, ok: true });
          } catch {
            results.push({
              error: `Resposta da IA não pôde ser interpretada para ${pdf.name}`,
              arquivo: pdf.name
            });
          }
        } else {
          results.push({
            error: `Resposta da IA não pôde ser interpretada para ${pdf.name}`,
            arquivo: pdf.name
          });
        }
      }

    } catch (pdfErr) {
      results.push({
        error: `Erro ao processar ${pdf.name}: ${pdfErr.message}`,
        arquivo: pdf.name
      });
    }
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({ results })
  };
};
