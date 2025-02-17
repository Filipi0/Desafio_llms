// Backend: Express.js Server
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

console.log("🔍 Verificando variáveis de ambiente:");
console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Chave carregada" : "Chave NÃO encontrada");
console.log("GROQ_API_KEY:", process.env.GROQ_API_KEY ? "Chave carregada" : "Chave NÃO encontrada");
console.log("COHERE_API_KEY:", process.env.COHERE_API_KEY ? "Chave carregada" : "Chave NÃO encontrada");

// Rota para testar se a API está ativa
app.get('/', (req, res) => {
    res.send('🚀 API rodando com sucesso!');
});

// Função para enviar a pergunta para os modelos de IA e receber as respostas
const fetchResponses = async (question) => {
    const apis = {
        gemini: { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}` },
        groq: { url: 'https://api.groq.com/openai/v1/chat/completions', key: process.env.GROQ_API_KEY },
        cohere: { url: 'https://api.cohere.ai/v1/generate', key: process.env.COHERE_API_KEY }
    };
    
    const responses = await Promise.all(Object.entries(apis).map(async ([model, { url, key }]) => {
        try {
            let headers = { 'Content-Type': 'application/json' };
            let data;
            
            if (model === 'gemini') {
                data = { contents: [{ parts: [{ text: question }] }] };
            } else {
                headers['Authorization'] = `Bearer ${key}`;
                
                if (model === 'groq') {
                    data = { 
                        model: 'llama3-8b-8192',
                        messages: [
                            { "role": "system", "content": "Forneça apenas a resposta direta, sem explicações adicionais." },
                            { "role": "user", "content": question }
                        ],
                        max_tokens: 500 
                    };
                } else if (model === 'cohere') {
                    data = { model: 'command-r-plus', prompt: question, max_tokens: 200 };
                }
            }
            
            console.log(`Enviando requisição para ${model} API...`);
            const response = await axios.post(url, data, { headers });
            console.log(`Resposta de ${model}:`, response.data);
            
            let responseText;
            if (model === 'gemini') {
                responseText = response.data.candidates[0]?.content.parts[0]?.text || "Resposta não disponível.";
            } else if (model === 'groq' && response.data.choices) {
                responseText = response.data.choices[0]?.message.content || "Resposta não disponível.";
            } else if (response.data.choices) {
                responseText = response.data.choices[0]?.text || "Resposta não disponível.";
            } else if (response.data.generations) {
                responseText = response.data.generations[0]?.text || "Resposta não disponível.";
            } else {
                responseText = "Resposta não disponível.";
            }
            
            return { model, response: responseText };
        } catch (error) {
            console.error(`Erro com ${model}:`, error.response ? error.response.data : error.message);
            return { model, error: error.response ? error.response.data : error.message };
        }
    }));
    
    // Autoavaliação dos modelos
    const evaluationPrompt = {
        model: 'llama3-8b-8192',
        messages: [
            { "role": "system", "content": "Você é um avaliador de respostas em português. Analise as respostas dos modelos abaixo e escolha a melhor, explicando sua escolha em português." },
            { "role": "user", "content": JSON.stringify(responses) }
        ],
        max_tokens: 300
    };
    
    
    try {
        const evaluationResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', evaluationPrompt, {
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }
        });
        const bestResponse = evaluationResponse.data.choices[0]?.message.content || "Não foi possível determinar a melhor resposta.";
        return { responses, bestResponse };
    } catch (error) {
        console.error("Erro na avaliação das respostas:", error.response ? error.response.data : error.message);
        return { responses, bestResponse: "Erro na avaliação." };
    }
};

// Rota para enviar a pergunta e receber as respostas
app.post('/ask', async (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'A pergunta é obrigatória' });
    
    const results = await fetchResponses(question);
    res.json(results);
});

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
