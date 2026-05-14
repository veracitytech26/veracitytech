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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY não configurada. Acesse Vercel → Settings → Environment Variables e adicione a variável ANTHROPIC_API_KEY.'
    });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: 'JSON inválido' });
  }

  const { pdfs } = body;
  if (!pdfs || !Array.isArray(pdfs) || pdfs.length === 0) {
    return res.status(400).json({ error: 'Nenhum PDF enviado' });
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
model: 'claude-sonnet-4-5-20251001',
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

      const text = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');

      const clean = text
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      try {
        const parsed = JSON.parse(clean);
        results.push({ ...parsed, arquivo: pdf.name, ok: true });
      } catch (parseErr) {
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            results.push({ ...parsed, arquivo: pdf.name, ok: true });
          } catch {
            results.push({ error: `Não foi possível interpretar o PDF: ${pdf.name}`, arquivo: pdf.name });
          }
        } else {
          results.push({ error: `Não foi possível interpretar o PDF: ${pdf.name}`, arquivo: pdf.name });
        }
      }

    } catch (pdfErr) {
      results.push({ error: `Erro ao processar ${pdf.name}: ${pdfErr.message}`, arquivo: pdf.name });
    }
  }

  return res.status(200).json({ results });
}
