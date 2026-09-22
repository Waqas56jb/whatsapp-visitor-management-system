import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { default: app } = await import('./src/app.js');

const port = Number(process.env.PORT || 5000);
app.listen(port, () => {
  console.log(`WhatsApp VMS API running on http://localhost:${port}`);
});
