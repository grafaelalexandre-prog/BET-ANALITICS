require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { state } = require('./services/runtimeService');
const dataService = require('./services/dataService');

const settingsRoutes = require('./routes/settingsRoutes');
const competitionsRoutes = require('./routes/competitionsRoutes');
const aiRoutes = require('./routes/aiRoutes');
const resultsRoutes = require('./routes/resultsRoutes');
const watchlistRoutes = require('./routes/watchlistRoutes');
const systemRoutes = require('./routes/systemRoutes');
const scannerRoutes = require('./routes/scannerRoutes');

dataService.bindRuntime(state);

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/settings', settingsRoutes);
  app.use('/api', competitionsRoutes);
  app.use('/api', aiRoutes);
  app.use('/api/results', resultsRoutes);
  app.use('/api/watchlist', watchlistRoutes);
  app.use('/api', systemRoutes);
  app.use('/api', scannerRoutes);

app.get('/', (req, res) => {
  res.json({ ok: true, service: 'BetAnalytics API' });
});

app.get('/status', (req, res) => {
  res.json({ ok: true, status: 'online', ts: new Date().toISOString() });
});

return app;
}

module.exports = { createApp };
