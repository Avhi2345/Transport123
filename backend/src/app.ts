import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import transportRouter from './routes/transport';

// Load environment variables
dotenv.config();

const app = express();

// Serve uploads folder as static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Middlewares
app.use(cors({
  origin: '*', // For ease of connection; update with specific domain in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mounting Transport Router under original Django route context
app.use('/api/transport', transportRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error occurred.' });
});

export default app;
