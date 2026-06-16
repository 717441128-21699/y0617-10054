import express from 'express';
import productsRouter from './routes/products';
import promotionsRouter from './routes/promotions';
import checkoutRouter from './routes/checkout';
import seckillRouter from './routes/seckill';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Promotion Engine is running' });
});

app.use('/api/products', productsRouter);
app.use('/api/promotions', promotionsRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api', seckillRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Promotion Engine server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;
