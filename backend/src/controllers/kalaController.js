const { chatWithKala } = require('../services/kalaAgent');

const chat = async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: 'Kala AI is not configured. GROQ_API_KEY is missing.' });
    }

    const userContext = {
      id:            req.user.id,
      name:          req.user.name,
      role:          req.user.role,
      project_codes: req.user.project_codes || [],
    };

    const result = await chatWithKala(messages, userContext);
    res.json(result);
  } catch (err) {
    console.error('Kala chat error:', err.message, err.stack);
    if (err.status === 401 || err.message?.includes('API key') || err.message?.includes('API_KEY') || err.message?.includes('Invalid API key')) {
      return res.status(503).json({ error: 'Kala AI is unavailable — check GROQ_API_KEY.' });
    }
    if (err.status === 429 || err.message?.includes('rate_limit') || err.message?.includes('quota')) {
      return res.status(429).json({ error: 'Kala has hit the rate limit. Please wait a moment and try again.' });
    }
    const isOverload = err.status === 503 || err.message?.includes('overloaded') || err.message?.includes('unavailable');
    if (isOverload) {
      return res.status(503).json({ error: 'Kala is busy right now — please try again in a moment.' });
    }
    res.status(500).json({ error: 'Kala encountered an error. Please try again.' });
  }
};

module.exports = { chat };
