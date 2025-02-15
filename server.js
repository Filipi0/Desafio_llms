const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
 
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// Função para enviar a pergunta para os modelos de IA
const fetchResponses = async (question) => {
    const apis = {
        gemini: { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}` },
        openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', key: process.env.OPENROUTER_API_KEY },
        cohere: { url: 'https://api.cohere.ai/v1/generate', key: process.env.COHERE_API_KEY }
    };
    
    const requests = Object.entries(apis).map(async ([model, { url, key }]) => {
        try {
            let headers = { 'Content-Type': 'application/json' };
            let data;
            
            if (model === 'gemini') {
                data = { contents: [{ parts: [{ text: question }] }] };
            } else {
                headers['Authorization'] = `Bearer ${key}`;
                if (model === 'openrouter') {
                    headers['HTTP-Referer'] = process.env.SITE_URL || 'http://localhost';
                    headers['X-Title'] = process.env.SITE_NAME || 'MyApp';
                    data = { 
                        model: 'cognitivecomputations/dolphin3.0-r1-mistral-24b:free',
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
            
            console.log(`Sending request to ${model} API...`);
            const response = await axios.post(url, data, { headers });
            console.log(`Response from ${model}:`, response.data);
            
            let responseText;
            if (model === 'gemini') {
                responseText = response.data.candidates[0].content.parts[0].text;
            } else if (model === 'openrouter' && response.data.choices) {
                responseText = response.data.choices[0].message.content;
            } else if (response.data.choices) {
                responseText = response.data.choices[0].text;
            } else if (response.data.generations) {
                responseText = response.data.generations[0].text;
            } else {
                responseText = response.data;
            }
            
            return { model, response: responseText };
        } catch (error) {
            console.error(`Error with ${model}:`, error.response ? error.response.data : error.message);
            return { model, error: error.response ? error.response.data : error.message };
        }
    });

    return Promise.all(requests);
};

//rota para enviar a pergunta
app.post('/ask', async (req, res) => {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });
    
    const results = await fetchResponses(question);
    res.json(results);
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
