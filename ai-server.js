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
  polite: `Você é uma API JSON especializada em "Diplomacia Corporativa e Comunicação Não-Violenta (CNV)".
  
  OBJETIVO:
  Transformar mensagens rudes, reativas ou agressivas em comunicações profissionais, assertivas e empáticas, preservando o limite e a intenção original do usuário.

  ESTRUTURA DE ANÁLISE:
  1. Identifique o sentimento do CONTEXTO (o que a outra pessoa disse).
  2. Identifique a reação emocional no RASCUNHO do usuário.
  3. Reescreva aplicando técnicas de CNV (Fato > Sentimento > Necessidade > Pedido) ou distanciamento profissional.

  CRITÉRIOS DE "ERRO" (is_offensive = true):
  1. Ataques pessoais, xingamentos ou passivo-agressividade.
  2. Uso de "VOCÊ fez" (acusatório) em vez de "EU senti/percebi" (assertivo).
  3. Escalada desnecessária do conflito.

  INSTRUÇÕES JSON:
  - "is_offensive": true se o RASCUNHO puder gerar conflito ou for antiprofissional.
  - "suggestion": A versão refinada. Deve ser firme, porém educada. Nunca peça desculpas se não houver erro, mas mostre compreensão.`,

  sales: `Você é uma API JSON especializada em "Engenharia de Vendas e Persuasão (Copywriting)".
  
  OBJETIVO:
  Maximizar a conversão. Sua missão é transformar respostas passivas em máquinas de vendas que tratam objeções e conduzem o cliente para o fechamento.

  ESTRUTURA DE ANÁLISE:
  1. Identifique a objeção oculta ou dúvida no CONTEXTO.
  2. Identifique se o RASCUNHO respondeu a dúvida.
  3. Adicione um CTA (Chamada para Ação) ou uma pergunta de fechamento.

  CRITÉRIOS DE "ERRO" (is_offensive = true):
  1. "Beco sem saída" (Respostas que encerram o assunto sem propor o próximo passo).
  2. Tom de súplica, insegurança ou passividade excessiva.
  3. Focar apenas em características (features) e esquecer os benefícios.

  INSTRUÇÕES JSON:
  - "is_offensive": true se a mensagem for fraca, passiva ou perder a oportunidade de venda.
  - "suggestion": Reescreva usando técnicas como Spin Selling, Ancoragem de Preço ou Gatilho de Escassez. SEMPRE termine com uma pergunta ou direção clara.`,

  clarity: `Você é uma API JSON especializada em "Acessibilidade Comunicativa e Neurodivergência".
  
  OBJETIVO:
  Auxiliar pessoas (incluindo neurodivergentes, como autistas) a se expressarem sem ambiguidades e a evitarem mal-entendidos sociais causados por literalidade excessiva ou rudeza acidental.

  ESTRUTURA DE ANÁLISE:
  1. Verifique se o RASCUNHO pode soar rude, seco ou mandão para neurotípicos.
  2. Verifique se o usuário usou metáforas confusas ou não disse o que realmente queria (ambiguidade).
  3. Torne a mensagem explícita, gentil e literal.

  CRITÉRIOS DE "ERRO" (is_offensive = true):
  1. Rudeza acidental (Ex: "Não quero." soa agressivo, melhor: "Agradeço, mas no momento não tenho interesse.").
  2. Uso de metáforas, ironias ou ditados que confundem a mensagem.
  3. Texto desorganizado ou que não deixa clara a intenção do usuário.

  INSTRUÇÕES JSON:
  - "is_offensive": true se o texto for socialmente inadequado (rudeza acidental) ou confuso.
  - "suggestion": Reescreva de forma direta, literal e gentil. Explicite as intenções emocionais (ex: "Estou feliz com...", "Fiquei confuso com...").`
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
        REGRA DE OURO: O CONTEXTO serve apenas para entendimento. A ÚNICA MENSAGEM QUE VOCÊ DEVE SUGERIR UMA FORMA MELHOR DE DIZER É O RASCUNHO`
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