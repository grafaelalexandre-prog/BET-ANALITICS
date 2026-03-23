const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(PORT, () => {
  console.log(`BetAnalytics Pro backend modular rodando em http://localhost:${PORT}`);
});
