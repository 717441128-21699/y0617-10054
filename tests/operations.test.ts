import { dataStore } from '../src/store/dataStore';
import { promotionService } from '../src/services/promotionService';
import { productService } from '../src/services/productService';
import { seckillQueue, SeckillResult } from '../src/services/seckillQueue';
import {
  PromotionType,
  ScopeType,
  StackingMode,
  PromotionStatus,
  Product
} from '../src/types';

function submitSeckillRequest(
  userId: string,
  promotionId: string,
  productId: string,
  quantity: number
): Promise<SeckillResult> {
  return new Promise((resolve) => {
    seckillQueue.submit({
      requestId: `req-${Date.now()}-${Math.random()}`,
      userId,
      promotionId,
      productId,
      quantity,
      resolve
    });
  });
}

describe('运营闭环 - 版本管理 & 审批流程', () => {
  let productA: Product;
  let productB: Product;

  beforeAll(() => {
    productA = dataStore.addProduct({
      name: '版本测试商品A',
      price: 100,
      categoryId: 'cat-test',
      stock: 100
    });
    productB = dataStore.addProduct({
      name: '版本测试商品B',
      price: 200,
      categoryId: 'cat-test',
      stock: 50
    });
  });

  beforeEach(() => {
    seckillQueue.resetUserPurchases();
  });

  test('创建活动自动生成v1版本', () => {
    const promotion = promotionService.createPromotion({
      name: '版本测试活动',
      description: '测试版本管理',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      startTime: Date.now(),
      endTime: Date.now() + 86400000,
      operatorId: 'ops-001'
    });

    const versions = promotionService.getVersions(promotion.id);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].changeType).toBe('create');
    expect(versions[0].operatorId).toBe('ops-001');
  });

  test('更新活动生成新版本', () => {
    const promotion = promotionService.createPromotion({
      name: '更新测试活动',
      description: '初始版本',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 100, discountAmount: 10 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      startTime: Date.now(),
      endTime: Date.now() + 86400000
    });

    const initialVersions = promotionService.getVersions(promotion.id);
    const initialCount = initialVersions.length;

    promotionService.updatePromotion(promotion.id, {
      description: '更新后的描述',
      config: { threshold: 200, discountAmount: 30 }
    }, {
      operatorId: 'ops-002',
      changeDescription: '调整满减门槛'
    });

    const versionsAfter = promotionService.getVersions(promotion.id);
    expect(versionsAfter.length).toBe(initialCount + 1);
    expect(versionsAfter[0].changeType).toBe('update');
    expect(versionsAfter[0].changeDescription).toBe('调整满减门槛');
  });

  test('版本对比 - 检测差异字段', () => {
    const promotion = promotionService.createPromotion({
      name: '对比测试活动',
      description: 'v1描述',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      startTime: Date.now(),
      endTime: Date.now() + 86400000
    });

    promotionService.updatePromotion(promotion.id, {
      name: '对比测试活动V2',
      priority: 20,
      config: { discountRate: 0.85 }
    });

    const versions = promotionService.getVersions(promotion.id);
    const diffs = promotionService.getVersionDiff(promotion.id, versions[1].version, versions[0].version);

    const diffFields = diffs.map(d => d.field);
    expect(diffFields).toContain('name');
    expect(diffFields).toContain('priority');
    expect(diffFields).toContain('config');
  });

  test('提交审批 - 状态变为待审批', () => {
    const promotion = promotionService.createPromotion({
      name: '审批测试活动',
      description: '待审批',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      startTime: Date.now(),
      endTime: Date.now() + 86400000
    });

    expect(promotion.status).toBe(PromotionStatus.DRAFT);

    const updated = promotionService.submitForApproval(promotion.id, 'ops-001');
    expect(updated?.status).toBe(PromotionStatus.PENDING_APPROVAL);
  });

  test('审批通过并上线', () => {
    const promotion = promotionService.createPromotion({
      name: '审批通过测试',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      startTime: Date.now(),
      endTime: Date.now() + 86400000
    });

    promotionService.submitForApproval(promotion.id);

    const approved = promotionService.approvePromotion(promotion.id, {
      operatorId: 'approver-001',
      activate: true,
      changeDescription: '审批通过，立即上线'
    });

    expect(approved?.status).toBe(PromotionStatus.ACTIVE);

    const versions = promotionService.getVersions(promotion.id);
    expect(versions[0].changeType).toBe('approve');
  });

  test('审批驳回 - 退回草稿状态', () => {
    const promotion = promotionService.createPromotion({
      name: '审批驳回测试',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      startTime: Date.now(),
      endTime: Date.now() + 86400000
    });

    promotionService.submitForApproval(promotion.id);

    const rejected = promotionService.rejectPromotion(promotion.id, {
      operatorId: 'approver-002',
      rejectReason: '优惠力度过大，需要重新评估'
    });

    expect(rejected?.status).toBe(PromotionStatus.DRAFT);

    const versions = promotionService.getVersions(promotion.id);
    expect(versions[0].changeType).toBe('reject');
    expect(versions[0].changeDescription).toContain('优惠力度过大');
  });

  test('回滚到历史版本', () => {
    const promotion = promotionService.createPromotion({
      name: '回滚测试活动',
      description: 'v1描述',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      startTime: Date.now(),
      endTime: Date.now() + 86400000
    });

    const v1Number = promotionService.getVersions(promotion.id)[0].version;

    promotionService.updatePromotion(promotion.id, {
      description: 'v2描述',
      config: { discountRate: 0.8, maxDiscountAmount: 50 }
    });

    const v2 = promotionService.getPromotion(promotion.id);
    expect((v2?.config as any).discountRate).toBe(0.8);

    const rolledBack = promotionService.rollbackToVersion(promotion.id, v1Number, 'ops-001');
    expect(rolledBack).toBeDefined();
    expect((rolledBack?.config as any).discountRate).toBe(0.9);

    const versionsAfter = promotionService.getVersions(promotion.id);
    expect(versionsAfter[0].changeType).toBe('rollback');
  });
});

describe('运营闭环 - 冲突检测', () => {
  let productA: Product;
  let productB: Product;

  beforeAll(() => {
    productA = dataStore.addProduct({
      name: '冲突测试商品A',
      price: 100,
      categoryId: 'cat-electronics',
      stock: 100
    });
    productB = dataStore.addProduct({
      name: '冲突测试商品B',
      price: 200,
      categoryId: 'cat-clothing',
      stock: 50
    });

    const now = Date.now();

    dataStore.addPromotion({
      name: '已有全场9折',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000 * 7
    });

    dataStore.addPromotion({
      name: '已有满200减50',
      description: '',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 200, discountAmount: 50 },
      scope: { type: ScopeType.ALL },
      priority: 20,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000 * 7
    });
  });

  test('检测时间冲突', () => {
    const now = Date.now();

    const result = promotionService.detectConflicts({
      name: '新活动',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.85 },
      scope: { type: ScopeType.ALL },
      priority: 15,
      stackingMode: StackingMode.STACKABLE,
      startTime: now,
      endTime: now + 86400000
    });

    const timeConflicts = result.conflicts.filter(c => c.type === 'time');
    expect(timeConflicts.length).toBeGreaterThan(0);
  });

  test('检测同类型范围冲突标记为error', () => {
    const now = Date.now();

    const result = promotionService.detectConflicts({
      name: '新折扣活动',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.8 },
      scope: { type: ScopeType.ALL },
      priority: 15,
      stackingMode: StackingMode.STACKABLE,
      startTime: now,
      endTime: now + 86400000
    });

    const errorConflicts = result.conflicts.filter(c => c.level === 'error');
    expect(errorConflicts.length).toBeGreaterThan(0);
    expect(errorConflicts[0].type).toBe('scope');
  });

  test('检测互斥策略冲突', () => {
    const now = Date.now();

    const result = promotionService.detectConflicts({
      name: '秒杀活动',
      type: PromotionType.FLASH_SALE,
      config: { productId: productA.id, salePrice: 60, stock: 50 },
      scope: { type: ScopeType.PRODUCT, productIds: [productA.id] },
      priority: 100,
      stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
      startTime: now,
      endTime: now + 86400000
    });

    const stackingConflicts = result.conflicts.filter(c => c.type === 'stacking');
    expect(stackingConflicts.length).toBeGreaterThan(0);
  });

  test('检测优先级相同冲突', () => {
    const now = Date.now();

    const result = promotionService.detectConflicts({
      name: '同优先级活动',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.85 },
      scope: { type: ScopeType.CATEGORY, categoryIds: ['cat-clothing'] },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      startTime: now,
      endTime: now + 86400000
    });

    const priorityConflicts = result.conflicts.filter(c => c.type === 'priority');
    expect(priorityConflicts.length).toBeGreaterThan(0);
  });

  test('无冲突时返回hasConflicts为false', () => {
    const now = Date.now();

    const result = promotionService.detectConflicts({
      name: '不冲突的活动',
      type: PromotionType.BUY_GIFT,
      config: { buyProductId: productA.id, buyQuantity: 2, giftProductId: productB.id, giftQuantity: 1 },
      scope: { type: ScopeType.ALL },
      priority: 5,
      stackingMode: StackingMode.STACKABLE,
      startTime: now + 86400000 * 30,
      endTime: now + 86400000 * 60
    });

    expect(result.hasConflicts).toBe(false);
  });
});

describe('运营闭环 - 批量试算', () => {
  let productA: Product;
  let productB: Product;
  let productC: Product;

  beforeAll(() => {
    productA = dataStore.addProduct({
      name: '批量试算商品A',
      price: 100,
      categoryId: 'cat-electronics',
      stock: 100
    });
    productB = dataStore.addProduct({
      name: '批量试算商品B',
      price: 200,
      categoryId: 'cat-electronics',
      stock: 50
    });
    productC = dataStore.addProduct({
      name: '批量试算商品C',
      price: 50,
      categoryId: 'cat-food',
      stock: 200
    });
  });

  test('批量试算多组购物车', () => {
    const scenarios = [
      {
        scenarioId: 's1',
        scenarioName: '小额订单',
        cartItems: [{ productId: productA.id, quantity: 1 }]
      },
      {
        scenarioId: 's2',
        scenarioName: '中额订单',
        cartItems: [{ productId: productB.id, quantity: 2 }]
      },
      {
        scenarioId: 's3',
        scenarioName: '混合订单',
        cartItems: [
          { productId: productA.id, quantity: 2 },
          { productId: productC.id, quantity: 3 }
        ]
      }
    ];

    const results = promotionService.batchPreview(scenarios);

    expect(results.length).toBe(3);
    expect(results[0].scenarioId).toBe('s1');
    expect(results[1].scenarioId).toBe('s2');
    expect(results[2].scenarioId).toBe('s3');

    results.forEach(r => {
      expect(r.originalTotal).toBeDefined();
      expect(r.finalTotal).toBeDefined();
      expect(r.finalTotal).toBeLessThanOrEqual(r.originalTotal);
    });
  });

  test('批量试算带待测试的新活动', () => {
    const newPromotion = {
      name: '测试新满减',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 300, discountAmount: 80 },
      scope: { type: ScopeType.ALL },
      stackingMode: StackingMode.STACKABLE,
      priority: 50
    };

    const scenarios = [
      {
        scenarioId: 'test1',
        cartItems: [{ productId: productB.id, quantity: 2 }]
      }
    ];

    const results = promotionService.batchPreview(scenarios, newPromotion as any);

    expect(results.length).toBe(1);

    const hasNewPromo = results[0].appliedPromotions.some(
      p => p.promotionName === '测试新满减'
    );
    expect(hasNewPromo).toBe(true);
  });

  test('批量试算返回被跳过的活动及原因', () => {
    const scenarios = [
      {
        scenarioId: 'skip-test',
        cartItems: [{ productId: productC.id, quantity: 1 }]
      }
    ];

    const results = promotionService.batchPreview(scenarios);

    expect(results[0].skippedPromotions).toBeDefined();
    expect(Array.isArray(results[0].skippedPromotions)).toBe(true);

    results[0].skippedPromotions.forEach(p => {
      expect(p.promotionId).toBeDefined();
      expect(p.promotionName).toBeDefined();
      expect(p.reason).toBeDefined();
    });
  });
});

describe('运营闭环 - 秒杀成交统计', () => {
  let product: Product;
  let flashSalePromoId: string;

  beforeAll(() => {
    product = dataStore.addProduct({
      name: '秒杀统计商品',
      price: 100,
      categoryId: 'cat-flash',
      stock: 1000
    });

    const promo = dataStore.addPromotion({
      name: '秒杀统计测试活动',
      description: '',
      type: PromotionType.FLASH_SALE,
      config: {
        productId: product.id,
        salePrice: 60,
        stock: 100,
        limitPerUser: 5
      },
      scope: { type: ScopeType.PRODUCT, productIds: [product.id] },
      priority: 100,
      stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
      status: PromotionStatus.ACTIVE,
      startTime: Date.now() - 100000,
      endTime: Date.now() + 100000
    });
    flashSalePromoId = promo.id;
  });

  test('秒杀抢购成功后订单数增加', async () => {
    const statsBefore = promotionService.getSalesStats(flashSalePromoId);
    const orderCountBefore = statsBefore.orderCount;

    await submitSeckillRequest('stats-user-1', flashSalePromoId, product.id, 2);

    const statsAfter = promotionService.getSalesStats(flashSalePromoId);
    expect(statsAfter.orderCount).toBe(orderCountBefore + 1);
  });

  test('秒杀抢购成功后成交金额增加', async () => {
    const statsBefore = promotionService.getSalesStats(flashSalePromoId);
    const salesBefore = statsBefore.totalSales;

    await submitSeckillRequest('stats-user-2', flashSalePromoId, product.id, 3);

    const statsAfter = promotionService.getSalesStats(flashSalePromoId);
    expect(statsAfter.totalSales).toBeGreaterThan(salesBefore);
    expect(statsAfter.totalSales - salesBefore).toBe(60 * 3);
  });

  test('秒杀抢购成功后优惠金额增加', async () => {
    const statsBefore = promotionService.getSalesStats(flashSalePromoId);
    const discountBefore = statsBefore.totalDiscount;

    await submitSeckillRequest('stats-user-3', flashSalePromoId, product.id, 1);

    const statsAfter = promotionService.getSalesStats(flashSalePromoId);
    expect(statsAfter.totalDiscount).toBeGreaterThan(discountBefore);
    expect(statsAfter.totalDiscount - discountBefore).toBe(40);
  });

  test('秒杀已售数量和库存一致', async () => {
    await submitSeckillRequest('stats-user-4', flashSalePromoId, product.id, 2);

    const stats = promotionService.getSalesStats(flashSalePromoId) as any;
    const stock = stats.flashSaleStock;

    expect(stock).toBeDefined();
    expect(stats.flashSaleSold).toBe(stock.soldStock);
    expect(stats.flashSaleRemainingStock).toBe(stock.totalStock - stock.soldStock);
  });

  test('全部活动汇总中秒杀库存口径一致', () => {
    const overview = promotionService.getStatsOverview();
    const singleStats = promotionService.getSalesStats(flashSalePromoId) as any;

    const flashStats = overview.promotionStats.find(
      (s: any) => s.promotionId === flashSalePromoId
    );

    expect(flashStats).toBeDefined();
    expect(flashStats!.flashSaleSold).toBe(singleStats.flashSaleSold);
    expect((flashStats as any).flashSaleRemainingStock).toBe(singleStats.flashSaleRemainingStock);
  });
});

describe('运营闭环 - 看板时间筛选 & 导出', () => {
  let product: Product;

  beforeAll(() => {
    product = dataStore.addProduct({
      name: '时间筛选商品',
      price: 150,
      categoryId: 'cat-time',
      stock: 100
    });

    const promo = dataStore.addPromotion({
      name: '时间筛选测试活动',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.8 },
      scope: { type: ScopeType.ALL },
      priority: 5,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: Date.now() - 86400000 * 7,
      endTime: Date.now() + 86400000 * 7
    });

    const cartItems = productService.buildCartItems([{ productId: product.id, quantity: 1 }]);

    for (let i = 0; i < 3; i++) {
      const order = dataStore.addOrder({
        userId: `time-user-${i}`,
        items: cartItems,
        originalTotal: 150,
        finalTotal: 120,
        appliedPromotions: [{
          promotionId: promo.id,
          promotionName: '时间筛选测试活动',
          type: PromotionType.DISCOUNT,
          discountAmount: 30,
          description: '8折优惠'
        }],
        giftItems: [],
        status: 'paid'
      });
    }
  });

  test('按时间范围筛选统计数据', () => {
    const now = Date.now();
    const oneDay = 86400000;

    const statsAll = promotionService.getAllSalesStats();

    const statsRecent = promotionService.getAllSalesStats({
      startTime: now - oneDay,
      endTime: now + oneDay
    });

    expect(statsRecent.length).toBeGreaterThan(0);
  });

  test('总览数据支持时间范围', () => {
    const now = Date.now();
    const oneDay = 86400000;

    const overview = promotionService.getStatsOverview({
      startTime: now - oneDay,
      endTime: now + oneDay
    });

    expect(overview.totalOrders).toBeDefined();
    expect(overview.totalSales).toBeDefined();
    expect(overview.promotionStats.length).toBeGreaterThan(0);
  });

  test('导出JSON格式数据', () => {
    const exportData = promotionService.exportStats(undefined, 'json');

    expect(exportData.format).toBe('json');
    expect(exportData.filename).toContain('.json');
    expect(Array.isArray(exportData.data)).toBe(true);
  });

  test('导出CSV格式数据', () => {
    const exportData = promotionService.exportStats(undefined, 'csv');

    expect(exportData.format).toBe('csv');
    expect(exportData.filename).toContain('.csv');
    expect(typeof exportData.data).toBe('string');
    expect(exportData.data).toContain('活动ID');
    expect(exportData.data).toContain('订单数');
    expect(exportData.data).toContain('成交金额');
  });

  test('导出数据与接口数据一致', () => {
    const stats = promotionService.getAllSalesStats();
    const exportData = promotionService.exportStats(undefined, 'json');

    expect(exportData.data.length).toBe(stats.length);
  });
});
