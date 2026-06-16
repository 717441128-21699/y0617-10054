import { Request, Response, Router } from 'express';
import { promotionService } from '../services/promotionService';
import { PromotionStatus } from '../types';

const router = Router();

router.get('/stats/all', (_req: Request, res: Response) => {
  const stats = promotionService.getAllSalesStats();
  res.json({ data: stats });
});

router.get('/stats/overview', (_req: Request, res: Response) => {
  const overview = promotionService.getStatsOverview();
  res.json({ data: overview });
});

router.get('/', (req: Request, res: Response) => {
  const status = req.query.status as PromotionStatus | undefined;
  const promotions = promotionService.getAllPromotions(status);
  res.json({ data: promotions });
});

router.post('/preview', (req: Request, res: Response) => {
  try {
    const { promotion, cartItems } = req.body;
    if (!promotion || !cartItems) {
      res.status(400).json({ error: '缺少必要参数：promotion 和 cartItems' });
      return;
    }
    const result = promotionService.previewPromotion(promotion, cartItems);
    res.json({ data: result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '预览失败' });
  }
});

router.post('/wizard/submit', (req: Request, res: Response) => {
  try {
    const { basicInfo, scope, config, stacking, schedule, autoActivate } = req.body;

    if (!basicInfo || !scope || !config || !schedule) {
      res.status(400).json({ error: '缺少必要的向导步骤数据' });
      return;
    }

    const promotion = promotionService.createFromWizard({
      basicInfo,
      scope,
      config,
      stacking,
      schedule,
      autoActivate: autoActivate || false
    });

    res.status(201).json({ data: promotion });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '创建失败' });
  }
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

export default router;
