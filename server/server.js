import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { default: app } = await import('./src/app.js');

const port = Number(process.env.PORT || 5000);
app.listen(port, async () => {
  console.log(`WhatsApp VMS API running on http://localhost:${port}`);
  const [{ startMetering }, { startJobs }, { platformConfig }] = await Promise.all([
    import('./src/services/metrics.js'),
    import('./src/services/jobs.js'),
    import('./src/services/platformConfig.js'),
  ]);
  startMetering();
  startJobs();
  platformConfig(true).catch(() => {});
  // WHATSAPP_DISABLED=true: local test servers never open a WhatsApp session.
  if (process.env.WHATSAPP_DISABLED === 'true') return console.log('WhatsApp disabled (WHATSAPP_DISABLED=true).');
  import('./src/whatsapp/connection.js')
    .then(async ({ startAllWhatsApp }) => {
      const started = await startAllWhatsApp();
      console.log(`WhatsApp sessions started for companies: ${started.join(', ') || 'none'}`);
    })
    .catch((err) => console.error('WhatsApp failed to start:', err.message));
});
