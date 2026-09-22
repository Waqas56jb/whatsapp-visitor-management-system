import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { router } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

const origins = [process.env.CLIENT_ORIGIN, process.env.ADMIN_ORIGIN, 'http://localhost:5173', 'http://localhost:5174'].filter(Boolean);

app.use(
  cors({
    origin: origins,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api', router);
app.use(errorHandler);

export default app;
