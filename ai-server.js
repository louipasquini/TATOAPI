import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT || 3000;
const AUTH_API_URL = process.env.AUTH_API_URL;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === SEUS PROMPTS ORIGINAIS E DETALHADOS (INTACTOS) ===
const PROMPTS = {
  polite: `Você é um Assistente de Comunicação Pessoal focado em "Assertividade Empática".
  
  O ERRO ATUAL:
  Às vezes você tenta ser tão positivo que muda o sentido da frase (ex: o usuário recusa e você aceita por ele). ISSO É PROIBIDO.

  SUA MISSÃO:
  Reescreva o RASCUNHO do usuário mantendo RIGOROSAMENTE a intenção original (Sim, Não, Talvez, Reclamação), mas ajustando o tom para ser educado, maduro e humano.

  REGRA DE OURO (A LEI):
  1. SE O RASCUNHO DIZ "NÃO VOU": Sua sugestão DEVE ser uma recusa. Ex: "Poxa, hoje não consigo, divirtam-se!". JAMAIS sugira algo como "Espero que você venha".
  2. SE O RASCUNHO É UM XINGAMENTO: Traduza a raiva em limite. "Vai se foder" vira "Não gostei dessa atitude e prefiro encerrar o assunto".
  3. Contexto serve apenas para você saber com quem estamos falando, não para decidir a resposta.

  JSON OUTPUT:
  - "is_offensive": true se o rascunho tiver palavrões, for agressivo ou seco demais.
  - "suggestion": A reescrita que preserva o "NÃO" ou o "SIM" do usuário, mas com classe.`,

  sales: `Você é um Assistente de Vendas focado em "Conversão e Fechamento".
  
  SUA MISSÃO:
  Transformar respostas curtas ou passivas em respostas comerciais poderosas que conduzem ao fechamento.

  REGRA DE OURO:
  1. Identifique a dúvida do cliente no HISTÓRICO.
  2. Se o RASCUNHO do usuário respondeu a dúvida (mesmo que mal), sua sugestão deve responder a dúvida de forma completa e adicionar uma pergunta no final.
  3. Nunca encerre a conversa. Se o usuário disse "Custa 50 reais", sua sugestão deve ser "O investimento é de R$ 50,00 e inclui [benefício]. Vamos fechar?".

  JSON OUTPUT:
  - "is_offensive": true se o rascunho for fraco, "seco" ou perder a venda.
  - "suggestion": A versão vendedora, entusiasta e com CTA (Chamada para Ação).`,

  clarity: `Você é um Tradutor de Intenções focado em "Clareza e Literalidade".
  
  SUA MISSÃO:
  Ajudar o usuário a dizer EXATAMENTE o que pensa, sem margem para dúvidas, ironias ou rudeza acidental.

  REGRA DE OURO:
  1. Remova qualquer ironia, sarcasmo ou metáfora do RASCUNHO.
  2. Se o RASCUNHO é "Tá bom então" (mas o contexto mostra raiva), a sugestão deve explicitar: "Entendi sua posição, mas não concordo. Porém aceito a decisão."
  3. Seja gentil, mas cirurgicamente preciso.

  JSON OUTPUT:
  - "is_offensive": true se o rascunho for ambíguo, passivo-agressivo ou confuso.
  - "suggestion": A versão literal, clara e gentil.`
};

app.post('/analisar-mensagem', async (req, res) => {
  const { message, context, mode } = req.body;
  const token = req.headers['authorization'];

  if (!message) return res.status(400).json({ error: 'Mensagem não fornecida' });
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
  if (!AUTH_API_URL) return res.status(500).json({ error: 'Erro de configuração no servidor.' });

  try {
    // 1. VALIDAÇÃO DE USO (SEQUENCIAL)
    // Precisamos validar ANTES de chamar a OpenAI para garantir a segurança do plano e economizar tokens.
    const authResponse = await fetch(`${AUTH_API_URL}/internal/validate-usage`, {
        method: 'POST',
        headers: { 'Authorization': token }
    });

    const authData = await authResponse.json();

    // Verifica erros de autenticação ou limite (403, 429, etc)
    if (!authResponse.ok || !authData.allowed) {
        const errorMsg = authData.error || 'Acesso negado.';
        return res.status(authResponse.status === 200 ? 403 : authResponse.status).json({ error: errorMsg });
    }

    const userPlan = authData.plan; // 'TRIAL', 'ESSENTIAL' ou 'PROFESSIONAL'

    // === TRAVA DE SEGURANÇA ===
    // Se tentar usar modo SALES sendo ESSENTIAL, bloqueia.
    if (mode === 'sales' && userPlan === 'ESSENTIAL') {
        return res.status(403).json({ 
            error: "O modo Vendedor é exclusivo dos planos Trial e Profissional.",
            is_upgrade_required: true 
        });
    }

    // 2. SELEÇÃO DO PROMPT
    const selectedPrompt = PROMPTS[mode] || PROMPTS.polite;

    // 3. CHAMADA OPENAI (Só acontece se passar pela trava)
    const aiCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 250,
      messages: [
        {
          role: "system",
          content: selectedPrompt
        },
        {
          role: "user",
          content: `[[[ DADOS DE ENTRADA ]]]
          
          1. CONTEXTO (O que falaram para mim):
          """
          ${context || "Nenhum contexto."}
          """

          2. MEU RASCUNHO (O que eu quero responder):
          """
          ${message}
          """

          TAREFA: Reescreva o MEU RASCUNHO mantendo a minha decisão (Sim/Não), mas com o tom da sua persona.`
        }
      ],
      temperature: 0.3,
    });

    const result = JSON.parse(aiCompletion.choices[0].message.content);

    res.json({
      ...result,
      _meta: {
        plan: userPlan,
        usage: authData.usage
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar solicitação.' });
  }
});

app.get('/', (req, res) => {
  res.send('AI Worker (Secure) está online.');
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(port);
}

export default app;