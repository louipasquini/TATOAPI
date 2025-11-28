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
  polite: `Você é uma Engine de Reescrita de Texto focada em "Diplomacia e Profissionalismo".
  
  SUA MISSÃO:
  O usuário escreveu um RASCUNHO (provavelmente com raiva ou pressa) em resposta a um HISTÓRICO DE CONVERSA.
  Sua única tarefa é reescrever esse RASCUNHO para que ele atinja o mesmo objetivo, mas de forma educada, corporativa e profissional.

  REGRAS DE OURO:
  1. O HISTÓRICO serve apenas para você entender o tom da conversa. NÃO RESPONDA AO HISTÓRICO.
  2. A "suggestion" deve ser uma versão melhorada do RASCUNHO.
  3. Se o Rascunho for "Vai se foder", e o contexto for um cliente reclamando, a sugestão deve ser "Compreendo sua frustração, mas precisamos manter o respeito profissional."

  JSON OUTPUT:
  - "is_offensive": true se o rascunho original for rude, agressivo ou inadequado.
  - "suggestion": O texto reescrito pronto para ser enviado.`,

  sales: `Você é uma Engine de Reescrita de Texto focada em "Técnicas de Vendas e Fechamento".
  
  SUA MISSÃO:
  O usuário escreveu um RASCUNHO fraco ou passivo para um cliente potencial (visto no HISTÓRICO).
  Sua tarefa é reescrever esse RASCUNHO aplicando gatilhos mentais, quebra de objeção e Chamadas para Ação (CTA).

  REGRAS DE OURO:
  1. O HISTÓRICO mostra o que o cliente perguntou.
  2. O RASCUNHO é a resposta do vendedor. Melhore essa resposta!
  3. Nunca deixe a conversa morrer. Sempre termine com uma pergunta ou próximo passo.

  JSON OUTPUT:
  - "is_offensive": true se o rascunho for "mole", passivo ou sem estratégia de venda.
  - "suggestion": O texto reescrito usando Spin Selling ou gatilhos de persuasão.`,

  clarity: `Você é uma Engine de Reescrita de Texto focada em "Clareza e Literalidade".
  
  SUA MISSÃO:
  O usuário escreveu um RASCUNHO que pode ser ambíguo, metafórico ou acidentalmente rude.
  Sua tarefa é traduzir esse RASCUNHO para uma linguagem direta, gentil e explícita, ideal para evitar mal-entendidos.

  REGRAS DE OURO:
  1. Analise o HISTÓRICO para entender o tópico.
  2. Reescreva o RASCUNHO removendo ironias, indiretas ou duplos sentidos.
  3. Explicite a emoção ou intenção por trás do texto.

  JSON OUTPUT:
  - "is_offensive": true se o rascunho for confuso, ambíguo ou soe rude sem querer.
  - "suggestion": O texto reescrito de forma literal e gentil.`
};

const verifyUsage = async (req, res, next) => {
  // Mantive a estrutura original caso queira voltar para middleware, 
  // mas a rota principal abaixo usa execução paralela para velocidade.
  next(); 
};

app.post('/analisar-mensagem', async (req, res) => {
  const { message, context, mode } = req.body;
  const token = req.headers['authorization'];

  if (!message) return res.status(400).json({ error: 'Mensagem não fornecida' });
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
  if (!AUTH_API_URL) return res.status(500).json({ error: 'Erro de configuração no servidor.' });

  const selectedPrompt = PROMPTS[mode] || PROMPTS.polite;

  // 1. Dispara validação de saldo (Auth API)
  const authPromise = axios.post(`${AUTH_API_URL}/internal/validate-usage`, {}, {
    headers: { 'Authorization': token }
  });

  // 2. Dispara processamento da IA (OpenAI)
  // AQUI ESTÁ A MUDANÇA CRÍTICA NA ESTRUTURA DA MENSAGEM
  const aiPromise = openai.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: selectedPrompt
      },
      {
        role: "user",
        content: `[[[ INPUT DADOS ]]]
        
        1. HISTÓRICO DA CONVERSA (Contexto - Apenas para leitura):
        """
        ${context || "Nenhum contexto disponível."}
        """

        2. RASCUNHO DO USUÁRIO (Texto que DEVE ser reescrito/corrigido):
        """
        ${message}
        """

        TAREFA: Ignore o histórico para fins de resposta. Seu trabalho é pegar o RASCUNHO acima e reescrevê-lo.`
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
    // Log silencioso para não poluir, mas útil saber que falhou
    // console.error(error); 
    res.status(500).json({ error: 'Erro ao processar solicitação.' });
  }
});

app.get('/', (req, res) => {
  res.send('AI Worker (Parallel Mode v2) está online.');
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(port);
}

module.exports = app;