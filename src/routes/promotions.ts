import { Request, Response, Router } from 'express';
import { promotionService } from '../services/promotionService';
import { PromotionStatus } from '../types';

const router = Router();

router.get('/stats/overview', (req: Request, res: Response) => {
  const startTime = req.query.startTime ? Number(req.query.startTime) : undefined;
  const endTime = req.query.endTime ? Number(req.query.endTime) : undefined;

  const overview = promotionService.getStatsOverview(
    startTime || endTime ? { startTime, endTime } : undefined
  );
  res.json({ data: overview });
});

router.get('/stats/analysis', (req: Request, res: Response) => {
  const promotionType = req.query.promotionType as any || undefined;
  const categoryId = req.query.categoryId as string || undefined;
  const operatorId = req.query.operatorId as string || undefined;
  const startTime = req.query.startTime ? Number(req.query.startTime) : undefined;
  const endTime = req.query.endTime ? Number(req.query.endTime) : undefined;
  const status = req.query.status ? (req.query.status as string).split(',') as any : undefined;

  const analysis = promotionService.getEffectAnalysis({
    promotionType,
    categoryId,
    operatorId,
    startTime,
    endTime,
    status
  });

  res.json({ data: analysis });
});

router.get('/stats/all', (req: Request, res: Response) => {
  const startTime = req.query.startTime ? Number(req.query.startTime) : undefined;
  const endTime = req.query.endTime ? Number(req.query.endTime) : undefined;

  const stats = promotionService.getAllSalesStats(
    startTime || endTime ? { startTime, endTime } : undefined
  );
  res.json({ data: stats });
});

router.get('/stats/export', (req: Request, res: Response) => {
  const startTime = req.query.startTime ? Number(req.query.startTime) : undefined;
  const endTime = req.query.endTime ? Number(req.query.endTime) : undefined;
  const format = (req.query.format as 'json' | 'csv') || 'json';

  const exportData = promotionService.exportStats(
    startTime || endTime ? { startTime, endTime } : undefined,
    format
  );

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
    res.send(exportData.data);
  } else {
    res.json({
      data: exportData.data,
      filename: exportData.filename
    });
  }
});

router.get('/stats/export-filtered', (req: Request, res: Response) => {
  const promotionType = req.query.promotionType as any || undefined;
  const categoryId = req.query.categoryId as string || undefined;
  const operatorId = req.query.operatorId as string || undefined;
  const startTime = req.query.startTime ? Number(req.query.startTime) : undefined;
  const endTime = req.query.endTime ? Number(req.query.endTime) : undefined;
  const status = req.query.status ? (req.query.status as string).split(',') as any : undefined;
  const format = (req.query.format as 'json' | 'csv') || 'json';

  const exportData = promotionService.exportStatsByFilter(
    {
      promotionType,
      categoryId,
      operatorId,
      startTime,
      endTime,
      status
    },
    format
  );

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
    res.send(exportData.data);
  } else {
    res.json({
      data: (exportData as any).data,
      filename: exportData.filename,
      summary: (exportData as any).summary
    });
  }
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

router.post('/batch-preview', (req: Request, res: Response) => {
  try {
    const { scenarios, promotionToTest } = req.body;
    if (!scenarios || !Array.isArray(scenarios)) {
      res.status(400).json({ error: '缺少必要参数：scenarios' });
      return;
    }
    const results = promotionService.batchPreview(scenarios, promotionToTest);
    res.json({ data: results });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '批量试算失败' });
  }
});

router.post('/detect-conflicts', (req: Request, res: Response) => {
  try {
    const { promotion, excludePromotionId } = req.body;
    if (!promotion) {
      res.status(400).json({ error: '缺少必要参数：promotion' });
      return;
    }
    const result = promotionService.detectConflicts(promotion, excludePromotionId);
    res.json({ data: result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '冲突检测失败' });
  }
});

router.post('/wizard/submit', (req: Request, res: Response) => {
  try {
    const { basicInfo, scope, config, stacking, schedule, autoActivate, operatorId, skipApproval } = req.body;

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
      autoActivate: autoActivate || false,
      operatorId,
      skipApproval: skipApproval || false
    });

    res.status(201).json({ data: promotion });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : '创建失败' });
  }
});

router.post('/:id/submit-approval', (req: Request, res: Response) => {
  const { operatorId } = req.body;
  const updated = promotionService.submitForApproval(req.params.id, operatorId);
  if (!updated) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: updated });
});

router.post('/:id/submit-approval-with-check', (req: Request, res: Response) => {
  const { operatorId } = req.body;
  const result = promotionService.submitForApprovalWithCheck(req.params.id, operatorId);
  if (!result.promotion && !result.success) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: result });
});

router.post('/:id/approve', (req: Request, res: Response) => {
  const { operatorId, activate, changeDescription } = req.body;
  const updated = promotionService.approvePromotion(req.params.id, {
    operatorId,
    activate: activate ?? false,
    changeDescription
  });
  if (!updated) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: updated });
});

router.post('/:id/reject', (req: Request, res: Response) => {
  const { operatorId, rejectReason } = req.body;
  const updated = promotionService.rejectPromotion(req.params.id, {
    operatorId,
    rejectReason
  });
  if (!updated) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: updated });
});

router.get('/:id/versions', (req: Request, res: Response) => {
  const versions = promotionService.getVersions(req.params.id);
  if (versions.length === 0) {
    res.status(404).json({ error: '活动不存在或无版本记录' });
    return;
  }
  res.json({ data: versions });
});

router.get('/:id/versions/:versionNumber', (req: Request, res: Response) => {
  const versionNumber = Number(req.params.versionNumber);
  const version = promotionService.getVersion(req.params.id, versionNumber);
  if (!version) {
    res.status(404).json({ error: '版本不存在' });
    return;
  }
  res.json({ data: version });
});

router.get('/:id/versions/diff/:v1/:v2', (req: Request, res: Response) => {
  const v1 = Number(req.params.v1);
  const v2 = Number(req.params.v2);
  const diffs = promotionService.getVersionDiff(req.params.id, v1, v2);
  res.json({ data: diffs });
});

router.post('/:id/rollback', (req: Request, res: Response) => {
  const { versionNumber, operatorId } = req.body;
  if (versionNumber === undefined) {
    res.status(400).json({ error: '缺少版本号' });
    return;
  }
  const updated = promotionService.rollbackToVersion(req.params.id, versionNumber, operatorId);
  if (!updated) {
    res.status(404).json({ error: '活动或版本不存在' });
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

  const startTime = req.query.startTime ? Number(req.query.startTime) : undefined;
  const endTime = req.query.endTime ? Number(req.query.endTime) : undefined;

  const stats = promotionService.getSalesStats(
    req.params.id,
    startTime || endTime ? { startTime, endTime } : undefined
  );
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
      endTime,
      operatorId
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
      endTime,
      operatorId
    });

    res.status(201).json({ data: promotion });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : '创建失败' });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  const { operatorId, changeDescription, ...updates } = req.body;
  const updated = promotionService.updatePromotion(req.params.id, updates, {
    operatorId,
    changeDescription
  });
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
  const { operatorId } = req.body;
  const updated = promotionService.activatePromotion(req.params.id, operatorId);
  if (!updated) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: updated });
});

router.post('/:id/deactivate', (req: Request, res: Response) => {
  const { operatorId } = req.body;
  const updated = promotionService.deactivatePromotion(req.params.id, operatorId);
  if (!updated) {
    res.status(404).json({ error: '活动不存在' });
    return;
  }
  res.json({ data: updated });
});

export default router;
