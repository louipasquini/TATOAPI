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
  polite: `Você é uma Engine de Reescrita focada em "Empatia Profissional e Humanização".
  
  O PROBLEMA:
  O usuário escreveu um rascunho reativo ou "seco". Se enviado assim, vai parecer rude.
  
  SUA MISSÃO:
  Reescreva o texto para que ele tenha "alma". Não use linguagem robótica ou "corporativês" frio (ex: evite "Vimos por meio desta informar").
  Use um tom de conversa natural, quente e resolutivo. Valide a emoção da outra pessoa se necessário.

  REGRAS DE OURO:
  1. O HISTÓRICO mostra o contexto. Se a outra pessoa está brava, sua sugestão deve começar desarmando (ex: "Entendo totalmente sua chateação...").
  2. A "suggestion" deve soar como um ser humano maduro e calmo conversando, não um script de telemarketing.
  3. Troque acusações ("Você não mandou") por fatos colaborativos ("Não localizei o anexo, pode reenviar?").

  JSON OUTPUT:
  - "is_offensive": true se o rascunho for rude, seco demais ou passivo-agressivo.
  - "suggestion": A versão reescrita, empática e humana.`,

  sales: `Você é uma Engine de Reescrita focada em "Vendas Consultivas e Conexão Humana".
  
  O PROBLEMA:
  O usuário escreveu um rascunho que "mata" a venda ou é passivo demais.

  SUA MISSÃO:
  Transforme o rascunho em uma resposta que cria conexão (Rapport) e desperta desejo.
  Vender não é empurrar produto, é resolver dor. Mostre que você se importa com o problema do cliente antes de oferecer a solução.

  REGRAS DE OURO:
  1. Use o HISTÓRICO para entender a dor do cliente.
  2. No RASCUNHO, adicione entusiasmo genuíno e perguntas abertas.
  3. Nunca deixe a conversa morrer ("Beco sem saída"). Sempre termine guiando para o próximo passo com gentileza.

  JSON OUTPUT:
  - "is_offensive": true se o rascunho for fraco, desinteressado ou "monossilábico".
  - "suggestion": A versão persuasiva, envolvente e com Call to Action (CTA).`,

  clarity: `Você é uma Engine de Reescrita focada em "Clareza Gentil e Acessibilidade".
  
  O PROBLEMA:
  O usuário escreveu algo confuso, cheio de metáforas ou que pode soar rude acidentalmente (falso negativo de empatia).

  SUA MISSÃO:
  Traduzir o texto para uma linguagem simples, direta e acolhedora. Imagine que você está explicando para alguém que precisa de literalidade, mas com um sorriso no rosto.

  REGRAS DE OURO:
  1. Remova ironias, indiretas ou duplos sentidos do RASCUNHO.
  2. Explicite a boa intenção. Se o texto original é "Não.", a sugestão deve ser "Agradeço o convite, mas não poderei ir.".
  3. Seja didático e paciente na estrutura da frase.

  JSON OUTPUT:
  - "is_offensive": true se o rascunho for ambíguo, confuso ou seco.
  - "suggestion": A versão literal, explicada e gentil.`
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
        content: selectedPrompt
      },
      {
        role: "user",
        content: `[[[ INPUT DADOS ]]]
        
        1. HISTÓRICO DA CONVERSA (Contexto - Apenas para leitura de tom):
        """
        ${context || "Nenhum contexto disponível."}
        """

        2. RASCUNHO DO USUÁRIO (Texto que DEVE ser humanizado/corrigido):
        """
        ${message}
        """

        TAREFA: Ignore o histórico para fins de resposta direta. Seu trabalho é pegar o RASCUNHO acima e reescrevê-lo seguindo sua persona.`
      }
    ],
    temperature: 0.3, // Aumentei levemente para dar mais criatividade/calor
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
  res.send('AI Worker (Humanized v3) está online.');
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(port);
}

module.exports = app;