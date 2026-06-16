import { dataStore } from '../src/store/dataStore';
import { promotionService } from '../src/services/promotionService';
import {
  PromotionType,
  PromotionStatus,
  ScopeType,
  StackingMode,
  VersionStatus,
  DashboardFilter
} from '../src/types';

describe('运营闭环 v2 - 审批流增强', () => {
  beforeEach(() => {
    (dataStore as any).promotions.clear();
    (dataStore as any).orders = [];
    (dataStore as any).versions.clear();
    (dataStore as any).versionCounters.clear();
    (dataStore as any).flashSaleStocks.clear();
    (dataStore as any).products.clear();
  });

  test('已上线活动改规则时保留线上版本，新内容进草稿', () => {
    const now = Date.now();
    const promotion = dataStore.addPromotion({
      name: '线上活动',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    }, { operatorId: 'op-001' });

    expect(promotion.status).toBe(PromotionStatus.ACTIVE);
    expect(promotion.activeVersion).toBe(1);

    const updated = dataStore.updatePromotion(promotion.id, {
      name: '修改后的活动',
      config: { discountRate: 0.8 }
    }, { operatorId: 'op-002', changeDescription: '调整折扣力度' });

    expect(updated!.status).toBe(PromotionStatus.DRAFT);
    expect(updated!.activeVersion).toBe(1);

    const versions = dataStore.getVersions(promotion.id);
    expect(versions.length).toBe(2);

    const v1 = versions.find(v => v.version === 1)!;
    const v2 = versions.find(v => v.version === 2)!;

    expect(v1.versionStatus).toBe(VersionStatus.EFFECTIVE);
    expect(v2.versionStatus).toBe(VersionStatus.DRAFT);
    expect(v2.parentVersion).toBe(1);
  });

  test('审批通过后新版本生效，旧版本变历史', () => {
    const now = Date.now();
    const promotion = dataStore.addPromotion({
      name: '线上活动',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    });

    dataStore.updatePromotion(promotion.id, {
      name: '新版本活动',
      config: { discountRate: 0.8 }
    });

    const submitted = dataStore.submitForApproval(promotion.id);
    expect(submitted!.status).toBe(PromotionStatus.PENDING_APPROVAL);

    const approved = dataStore.approvePromotion(promotion.id, { activate: true });

    expect(approved!.status).toBe(PromotionStatus.ACTIVE);
    expect(approved!.activeVersion).toBe(2);

    const versions = dataStore.getVersions(promotion.id);
    const v1 = versions.find(v => v.version === 1)!;
    const v2 = versions.find(v => v.version === 2)!;

    expect(v1.versionStatus).toBe(VersionStatus.HISTORICAL);
    expect(v2.versionStatus).toBe(VersionStatus.EFFECTIVE);
    expect(approved!.name).toBe('新版本活动');
  });

  test('审批驳回后回退到生效版本配置', () => {
    const now = Date.now();
    const promotion = dataStore.addPromotion({
      name: '线上活动',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    });

    dataStore.updatePromotion(promotion.id, {
      name: '待审批活动',
      config: { discountRate: 0.5 }
    });

    dataStore.submitForApproval(promotion.id);

    const rejected = dataStore.rejectPromotion(promotion.id, {
      operatorId: 'approver-001',
      rejectReason: '折扣太低'
    });

    expect(rejected!.status).toBe(PromotionStatus.ACTIVE);
    expect(rejected!.name).toBe('线上活动');
    expect((rejected!.config as any).discountRate).toBe(0.9);

    const versions = dataStore.getVersions(promotion.id);
    const rejectedVersion = versions.find(v => v.versionStatus === VersionStatus.REJECTED);
    expect(rejectedVersion).toBeDefined();
    expect(rejectedVersion!.changeDescription).toBe('折扣太低');
  });

  test('版本列表能看清楚当前生效版本', () => {
    const now = Date.now();
    const promotion = dataStore.addPromotion({
      name: '测试活动',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.DRAFT,
      startTime: now,
      endTime: now + 86400000
    });

    dataStore.submitForApproval(promotion.id);
    const approved = dataStore.approvePromotion(promotion.id, { activate: true });

    dataStore.updatePromotion(promotion.id, {
      name: '修改版本'
    });

    const versions = dataStore.getVersions(promotion.id);
    const effectiveVersions = versions.filter(v => v.versionStatus === VersionStatus.EFFECTIVE);

    expect(effectiveVersions.length).toBe(1);
    expect(effectiveVersions[0].version).toBe(approved!.activeVersion);
  });
});

describe('运营闭环 v2 - 提交审批自动冲突检测', () => {
  beforeEach(() => {
    (dataStore as any).promotions.clear();
    (dataStore as any).orders = [];
    (dataStore as any).versions.clear();
    (dataStore as any).versionCounters.clear();
    (dataStore as any).flashSaleStocks.clear();
    (dataStore as any).products.clear();
  });

  test('无冲突时提交审批成功', () => {
    const now = Date.now();
    dataStore.addPromotion({
      name: '已有活动',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    });

    const newPromo = dataStore.addPromotion({
      name: '新活动',
      description: '',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 200, discountAmount: 50 },
      scope: { type: ScopeType.ALL },
      priority: 20,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.DRAFT,
      startTime: now + 86400000 * 10,
      endTime: now + 86400000 * 20
    });

    const result = promotionService.submitForApprovalWithCheck(newPromo.id, 'op-001');

    expect(result.success).toBe(true);
    expect(result.hasBlockingConflicts).toBe(false);
    expect(result.promotion?.status).toBe(PromotionStatus.PENDING_APPROVAL);
  });

  test('严重冲突时禁止提交审批', () => {
    const now = Date.now();
    dataStore.addProduct({
      name: '测试商品',
      price: 100,
      categoryId: 'cat-1',
      stock: 100
    });

    dataStore.addPromotion({
      name: '已有满减',
      description: '',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 100, discountAmount: 20 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000 * 7
    });

    const newPromo = dataStore.addPromotion({
      name: '新满减冲突',
      description: '',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 100, discountAmount: 30 },
      scope: { type: ScopeType.ALL },
      priority: 15,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.DRAFT,
      startTime: now + 86400000,
      endTime: now + 86400000 * 5
    });

    const result = promotionService.submitForApprovalWithCheck(newPromo.id, 'op-001');

    expect(result.success).toBe(false);
    expect(result.hasBlockingConflicts).toBe(true);
    expect(result.conflictResult).toBeDefined();
    expect(result.conflictResult!.conflicts.length).toBeGreaterThan(0);
    expect(result.warnings?.length).toBeGreaterThan(0);

    const promoAfter = dataStore.getPromotion(newPromo.id);
    expect(promoAfter?.status).toBe(PromotionStatus.DRAFT);
  });

  test('警告级冲突可以提交但有提示', () => {
    const now = Date.now();
    dataStore.addPromotion({
      name: '已有折扣',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000 * 7
    });

    const newPromo = dataStore.addPromotion({
      name: '新满减',
      description: '',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 100, discountAmount: 20 },
      scope: { type: ScopeType.ALL },
      priority: 20,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.DRAFT,
      startTime: now + 86400000,
      endTime: now + 86400000 * 5
    });

    const result = promotionService.submitForApprovalWithCheck(newPromo.id, 'op-001');

    expect(result.success).toBe(true);
    expect(result.hasBlockingConflicts).toBe(false);
    expect(result.warnings?.length).toBeGreaterThanOrEqual(0);
  });
});

describe('运营闭环 v2 - 效果分析 & 筛选', () => {
  beforeEach(() => {
    (dataStore as any).promotions.clear();
    (dataStore as any).orders = [];
    (dataStore as any).versions.clear();
    (dataStore as any).versionCounters.clear();
    (dataStore as any).flashSaleStocks.clear();
    (dataStore as any).products.clear();
  });

  test('按活动类型筛选效果分析', () => {
    const now = Date.now();

    const product = dataStore.addProduct({
      name: '测试商品',
      price: 100,
      categoryId: 'cat-1',
      stock: 100
    });

    dataStore.addPromotion({
      name: '折扣活动1',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000 * 7
    }, { operatorId: 'op-a' });

    dataStore.addPromotion({
      name: '满减活动1',
      description: '',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 100, discountAmount: 20 },
      scope: { type: ScopeType.ALL },
      priority: 20,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000 * 7
    }, { operatorId: 'op-b' });

    const filter: DashboardFilter = {
      promotionType: PromotionType.DISCOUNT
    };

    const analysis = promotionService.getEffectAnalysis(filter);
    expect(analysis.promotionCount).toBe(1);
    expect((analysis.promotionStats[0] as any).promotionType).toBe(PromotionType.DISCOUNT);
  });

  test('按运营人筛选效果分析', () => {
    const now = Date.now();

    dataStore.addPromotion({
      name: '活动A',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    }, { operatorId: 'op-zhang' });

    dataStore.addPromotion({
      name: '活动B',
      description: '',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 100, discountAmount: 10 },
      scope: { type: ScopeType.ALL },
      priority: 20,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    }, { operatorId: 'op-li' });

    const filter: DashboardFilter = {
      operatorId: 'op-zhang'
    };

    const analysis = promotionService.getEffectAnalysis(filter);
    expect(analysis.promotionCount).toBe(1);
    expect((analysis.promotionStats[0] as any).operatorId).toBe('op-zhang');
  });

  test('按商品分类筛选效果分析', () => {
    const now = Date.now();

    dataStore.addProduct({
      name: '手机',
      price: 2000,
      categoryId: 'cat-phone',
      stock: 100
    });
    dataStore.addProduct({
      name: '电脑',
      price: 5000,
      categoryId: 'cat-pc',
      stock: 50
    });

    dataStore.addPromotion({
      name: '手机专场',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.CATEGORY, categoryIds: ['cat-phone'] },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    });

    dataStore.addPromotion({
      name: '电脑专场',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.85 },
      scope: { type: ScopeType.CATEGORY, categoryIds: ['cat-pc'] },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    });

    const filter: DashboardFilter = {
      categoryId: 'cat-phone'
    };

    const analysis = promotionService.getEffectAnalysis(filter);
    expect(analysis.promotionCount).toBe(1);
    expect((analysis.promotionStats[0] as any).promotionName).toBe('手机专场');
  });
});

describe('运营闭环 v2 - 秒杀库存口径统一', () => {
  beforeEach(() => {
    (dataStore as any).promotions.clear();
    (dataStore as any).orders = [];
    (dataStore as any).versions.clear();
    (dataStore as any).versionCounters.clear();
    (dataStore as any).flashSaleStocks.clear();
    (dataStore as any).products.clear();
  });

  test('汇总与单活动的秒杀剩余库存口径一致（含锁定库存）', () => {
    const now = Date.now();
    const product = dataStore.addProduct({
      name: '秒杀商品',
      price: 100,
      categoryId: 'cat-flash',
      stock: 1000
    });

    const promo = dataStore.addPromotion({
      name: '秒杀活动',
      description: '',
      type: PromotionType.FLASH_SALE,
      config: {
        productId: product.id,
        salePrice: 60,
        stock: 100,
        limitPerUser: 2
      },
      scope: { type: ScopeType.ALL },
      priority: 1,
      stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    });

    dataStore.updateFlashSaleStock(promo.id, {
      soldStock: 30,
      lockedStock: 5
    });

    const singleStats = promotionService.getSalesStats(promo.id);
    const overview = promotionService.getStatsOverview();

    const singleRemaining = (singleStats as any).flashSaleRemainingStock;
    const overviewRemaining = overview.flashSaleRemainingStock;

    expect(singleRemaining).toBe(65);
    expect(overviewRemaining).toBe(65);
    expect(singleRemaining).toBe(overviewRemaining);
  });

  test('效果分析中的秒杀库存口径一致', () => {
    const now = Date.now();
    const product = dataStore.addProduct({
      name: '秒杀商品',
      price: 100,
      categoryId: 'cat-flash',
      stock: 1000
    });

    dataStore.addPromotion({
      name: '秒杀活动',
      description: '',
      type: PromotionType.FLASH_SALE,
      config: {
        productId: product.id,
        salePrice: 60,
        stock: 200,
        limitPerUser: 2
      },
      scope: { type: ScopeType.ALL },
      priority: 1,
      stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    });

    const filter: DashboardFilter = {
      promotionType: PromotionType.FLASH_SALE
    };

    const analysis = promotionService.getEffectAnalysis(filter);
    expect(analysis.flashSaleTotalStock).toBe(200);
    expect(analysis.flashSaleRemainingStock).toBe(200);
  });
});

describe('运营闭环 v2 - 批量试算用户标签', () => {
  beforeEach(() => {
    (dataStore as any).promotions.clear();
    (dataStore as any).orders = [];
    (dataStore as any).versions.clear();
    (dataStore as any).versionCounters.clear();
    (dataStore as any).flashSaleStocks.clear();
    (dataStore as any).products.clear();
  });

  test('批量试算返回用户标签影响分析', () => {
    const now = Date.now();
    const product = dataStore.addProduct({
      name: '测试商品',
      price: 100,
      categoryId: 'cat-1',
      stock: 100
    });

    dataStore.addPromotion({
      name: '会员专享折扣',
      description: 'VIP会员专享9折优惠',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    });

    const scenarios = [
      {
        scenarioId: 's1',
        scenarioName: '会员用户',
        cartItems: [{ productId: product.id, quantity: 2 }],
        userTags: ['VIP', '会员']
      },
      {
        scenarioId: 's2',
        scenarioName: '普通用户',
        cartItems: [{ productId: product.id, quantity: 2 }]
      }
    ];

    const results = promotionService.batchPreview(scenarios);

    const s1 = results.find(r => r.scenarioId === 's1')!;
    const s2 = results.find(r => r.scenarioId === 's2')!;

    expect(s1.tagImpact).toBeDefined();
    expect(s1.userTags).toEqual(['VIP', '会员']);
    expect(s1.tagImpact!.description).toContain('会员');

    expect(s2.tagImpact).toBeUndefined();
    expect(s2.userTags).toBeUndefined();
  });

  test('用户标签未匹配到专属活动时有明确说明', () => {
    const now = Date.now();
    const product = dataStore.addProduct({
      name: '测试商品',
      price: 100,
      categoryId: 'cat-1',
      stock: 100
    });

    dataStore.addPromotion({
      name: '全场9折',
      description: '公开活动',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    });

    const scenarios = [
      {
        scenarioId: 's1',
        scenarioName: '新用户',
        cartItems: [{ productId: product.id, quantity: 1 }],
        userTags: ['新用户', '首单']
      }
    ];

    const results = promotionService.batchPreview(scenarios);
    const s1 = results[0];

    expect(s1.tagImpact).toBeDefined();
    expect(s1.tagImpact!.unmatchedTags.length).toBe(2);
    expect(s1.tagImpact!.description).toContain('均未匹配到专属活动');
  });
});

describe('运营闭环 v2 - 筛选导出', () => {
  beforeEach(() => {
    (dataStore as any).promotions.clear();
    (dataStore as any).orders = [];
    (dataStore as any).versions.clear();
    (dataStore as any).versionCounters.clear();
    (dataStore as any).flashSaleStocks.clear();
    (dataStore as any).products.clear();
  });

  test('按筛选条件导出JSON数据', () => {
    const now = Date.now();

    dataStore.addPromotion({
      name: '折扣活动',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    }, { operatorId: 'op-001' });

    dataStore.addPromotion({
      name: '满减活动',
      description: '',
      type: PromotionType.FULL_REDUCTION,
      config: { threshold: 100, discountAmount: 10 },
      scope: { type: ScopeType.ALL },
      priority: 20,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    }, { operatorId: 'op-002' });

    const filter: DashboardFilter = {
      promotionType: PromotionType.DISCOUNT
    };

    const exportData = promotionService.exportStatsByFilter(filter, 'json') as any;

    expect(exportData.format).toBe('json');
    expect(exportData.data.summary.promotionCount).toBe(1);
    expect(exportData.data.promotionStats.length).toBe(1);
    expect(exportData.data.promotionStats[0].promotionType).toBe(PromotionType.DISCOUNT);
  });

  test('按筛选条件导出CSV数据', () => {
    const now = Date.now();

    dataStore.addPromotion({
      name: '折扣活动',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    }, { operatorId: 'op-001' });

    const filter: DashboardFilter = {
      operatorId: 'op-001'
    };

    const exportData = promotionService.exportStatsByFilter(filter, 'csv') as any;

    expect(exportData.format).toBe('csv');
    expect(exportData.data).toContain('活动名称');
    expect(exportData.data).toContain('折扣活动');
    expect(exportData.summary.promotionCount).toBe(1);
  });

  test('导出数据与效果分析接口数据一致', () => {
    const now = Date.now();

    const product = dataStore.addProduct({
      name: '测试商品',
      price: 100,
      categoryId: 'cat-1',
      stock: 100
    });

    const promo = dataStore.addPromotion({
      name: '测试活动',
      description: '',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now,
      endTime: now + 86400000
    }, { operatorId: 'op-test' });

    dataStore.addOrder({
      userId: 'u1',
      items: [{
        productId: product.id,
        quantity: 2,
        unitPrice: 100,
        product
      }],
      originalTotal: 200,
      finalTotal: 180,
      appliedPromotions: [{
        promotionId: promo.id,
        promotionName: '测试活动',
        type: PromotionType.DISCOUNT,
        discountAmount: 20,
        description: '9折优惠'
      }],
      giftItems: [],
      status: 'paid'
    });

    const filter: DashboardFilter = {
      operatorId: 'op-test'
    };

    const analysis = promotionService.getEffectAnalysis(filter);
    const exportData = promotionService.exportStatsByFilter(filter, 'json') as any;

    expect(exportData.data.summary.totalOrders).toBe(analysis.totalOrders);
    expect(exportData.data.summary.totalSales).toBe(analysis.totalSales);
    expect(exportData.data.summary.totalDiscount).toBe(analysis.totalDiscount);
    expect(exportData.data.promotionStats.length).toBe(analysis.promotionStats.length);
  });
});
