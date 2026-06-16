import { Request, Response, Router } from 'express';
import { promotionService } from '../services/promotionService';
import { PromotionStatus } from '../types';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const status = req.query.status as PromotionStatus | undefined;
  const promotions = promotionService.getAllPromotions(status);
  res.json({ data: promotions });
});

router.get('/:id', (req: Request, res: Response) => {
  const promotion = promotionService.getPromotion(req.params.id);
  if (!promotion) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: promotion });
});

router.post('/', (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      type,
      config,
      scope,
      priority,
      stackingMode,
      startTime,
      endTime
    } = req.body;

    if (!name || !type || !config || !scope || startTime === undefined || endTime === undefined) {
      res.status(400).json({ error: '缺少必要参数' });
      return;
    }

    const promotion = promotionService.createPromotion({
      name,
      description: description || '',
      type,
      config,
      scope,
      priority: priority ?? 0,
      stackingMode: stackingMode || 'stackable',
      startTime,
      endTime
    });

    res.status(201).json({ data: promotion });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '创建失败' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  const updated = promotionService.updatePromotion(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: updated });
});

router.delete('/:id', (req: Request, res: Response) => {
  const success = promotionService.deletePromotion(req.params.id);
  if (!success) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ message: '删除成功' });
});

router.post('/:id/activate', (req: Request, res: Response) => {
  const updated = promotionService.activatePromotion(req.params.id);
  if (!updated) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: updated });
});

router.post('/:id/deactivate', (req: Request, res: Response) => {
  const updated = promotionService.deactivatePromotion(req.params.id);
  if (!updated) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: updated });
});

router.get('/:id/stats', (req: Request, res: Response) => {
  const promotion = promotionService.getPromotion(req.params.id);
  if (!promotion) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  const stats = promotionService.getSalesStats(req.params.id);
  res.json({ data: stats });
});

router.get('/stats/all', (_req: Request, res: Response) => {
  const stats = promotionService.getAllSalesStats();
  res.json({ data: stats });
});

export default router;
