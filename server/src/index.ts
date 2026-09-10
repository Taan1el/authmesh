import { createApp } from './app.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const { app } = createApp();

app.listen(PORT, () => {
  console.log(`[AuthMesh Security Gateway] Running on http://localhost:${PORT}`);
  console.log(`[AuthMesh Security Gateway] Healthcheck at http://localhost:${PORT}/api/health`);
});
