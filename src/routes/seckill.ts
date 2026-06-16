import { Request, Response, Router } from 'express';
import { seckillQueue } from '../services/seckillQueue';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.post('/seckill/:promotionId', (req: Request, res: Response) => {
  try {
    const { promotionId } = req.params;
    const { userId, quantity } = req.body;

    if (!userId) {
      res.status(400).json({ error: '用户ID不能为空' });
      return;
    }

    const buyQuantity = quantity || 1;

    const requestId = uuidv4();

    const resultPromise = new Promise<any>((resolve) => {
      seckillQueue.submit({
        requestId,
      userId,
      promotionId,
      productId: '',
      quantity: buyQuantity,
      resolve
    });
  });

    resultPromise.then((result) => {
      if (result.success) {
        res.json({ data: result });
      } else {
        res.status(400).json({ error: result.message });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '抢购失败' });
  }
});

router.get('/seckill/:promotionId/stock', (req: Request, res: Response) => {
  const { promotionId } = req.params;
  const stock = seckillQueue.getStockInfo(promotionId);

  if (!stock) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }

  const available = stock.totalStock - stock.soldStock - stock.lockedStock;

  res.json({
    data: {
      ...stock,
      availableStock: available
    }
  });
});

router.get('/seckill/:promotionId/queue-length', (req: Request, res: Response) => {
  const { promotionId } = req.params;
  const length = seckillQueue.getQueueLength(promotionId);
  res.json({ data: { queueLength: length } });
});

export default router;
