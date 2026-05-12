const { chatWithKala } = require('../services/kalaAgent');

const chat = async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Kala AI is not configured. GEMINI_API_KEY is missing.' });
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
    console.error('Kala chat error:', err.message);
    if (err.status === 401 || err.message?.includes('API key') || err.message?.includes('API_KEY')) {
      return res.status(503).json({ error: 'Kala AI is unavailable — check GEMINI_API_KEY.' });
    }
    res.status(500).json({ error: 'Kala encountered an error. Please try again.' });
  }
};

module.exports = { chat };
