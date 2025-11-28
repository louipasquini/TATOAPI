require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const AUTH_API_URL = process.env.AUTH_API_URL;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PROMPTS = {
  polite: `Você é uma API JSON especializada em "Polidez Corporativa".
  ESTRUTURA DA TAREFA: Analise o RASCUNHO baseado no CONTEXTO.
  CRITÉRIOS DE "ERRO":
  1. Agressividade / Palavrões.
  2. Ironia / Sarcasmo.
  3. Erros Gramaticais graves.
  INSTRUÇÕES JSON:
  - "is_offensive": true se o RASCUNHO violar os critérios.
  - "suggestion": A versão polida do RASCUNHO. Mantenha a intenção original, mas mude o TOM para profissional.`,

  sales: `Você é uma API JSON especializada em "Engenharia de Vendas e Persuasão".
  ESTRUTURA DA TAREFA: Você é um Mentor de Vendas Sênior analisando a resposta de um vendedor.
  CRITÉRIOS DE "ERRO":
  1. Mensagem passiva ou sem CTA.
  2. Não trata objeção do cliente.
  3. Tom de súplica.
  INSTRUÇÕES JSON:
  - "is_offensive": true se a mensagem for fraca em vendas.
  - "suggestion": Reescreva usando Spin Selling ou gatilhos mentais, com CTA.`,

  clarity: `Você é uma API JSON especializada em "Comunicação Clara e Literal".
  CRITÉRIOS DE "ERRO":
  1. Texto confuso ou indireto.
  2. Metáforas, ironias ou ditados.
  3. Rudeza não intencional.
  INSTRUÇÕES JSON:
  - "is_offensive": true se o texto for ambíguo ou inadequado.
  - "suggestion": Reescreva de forma direta, literal e gentil, explicitando intenções.`
};

app.post('/analisar-mensagem', async (req, res) => {
  const { message, context, mode } = req.body;
  const token = req.headers['authorization'];

  if (!message) return res.status(400).json({ error: 'Mensagem não fornecida' });
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
  if (!AUTH_API_URL) return res.status(500).json({ error: 'Erro de configuração no servidor.' });

  const selectedPrompt = PROMPTS[mode] || PROMPTS.polite;

  const authPromise = axios.post(`${AUTH_API_URL}/internal/validate-usage`, {}, {
    headers: { 'Authorization': token }
  });

  const aiPromise = openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${selectedPrompt}
        REGRA DE OURO: O CONTEXTO serve apenas para entendimento. NUNCA misture fatos do contexto na sugestão.`
      },
      {
        role: "user",
        content: `=== CONTEXTO (MENSAGENS DE OUTRAS PESSOAS - APENAS LEIA) ===\n${context || "Sem contexto."}\n=== RASCUNHO (ANALISE E CORRIJA APENAS ESTE TEXTO) ===\n"${message}"`
      }
    ],
    temperature: 0.2,
  });

  try {
    const [authResponse, aiCompletion] = await Promise.all([authPromise, aiPromise]);

    if (!authResponse.data.allowed) {
      return res.status(403).json({ error: authResponse.data.error || 'Acesso negado.' });
    }

    const result = JSON.parse(aiCompletion.choices[0].message.content);

    res.json({
      ...result,
      _meta: {
        plan: authResponse.data.plan,
        usage: authResponse.data.usage
      }
    });

  } catch (error) {
    if (error.response && error.response.status) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: 'Erro ao processar solicitação.' });
  }
});

app.get('/', (req, res) => {
  res.send('AI Worker (Parallel Mode) está online.');
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(port);
}

module.exports = app;