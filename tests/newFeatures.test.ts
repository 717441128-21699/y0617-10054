import { dataStore } from '../src/store/dataStore';
import { promotionService } from '../src/services/promotionService';
import { productService } from '../src/services/productService';
import { checkoutService } from '../src/services/checkoutService';
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

describe('New Features & Bug Fixes', () => {
  let productA: Product;
  let productB: Product;
  let productC: Product;
  let flashSalePromoId: string;
  let discountPromoId: string;

  beforeAll(() => {
    productA = dataStore.addProduct({
      name: '测试商品A',
      price: 100,
      categoryId: 'cat-electronics',
      stock: 1000
    });

    productB = dataStore.addProduct({
      name: '测试商品B',
      price: 200,
      categoryId: 'cat-electronics',
      stock: 500
    });

    productC = dataStore.addProduct({
      name: '测试商品C',
      price: 50,
      categoryId: 'cat-clothing',
      stock: 200
    });

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const discountPromo = dataStore.addPromotion({
      name: '全场9折',
      description: '全场商品9折',
      type: PromotionType.DISCOUNT,
      config: { discountRate: 0.9 },
      scope: { type: ScopeType.ALL },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now - oneDay,
      endTime: now + oneDay
    });
    discountPromoId = discountPromo.id;

    const flashSalePromo = dataStore.addPromotion({
      name: '秒杀活动A',
      description: '商品A秒杀',
      type: PromotionType.FLASH_SALE,
      config: {
        productId: productA.id,
        salePrice: 60,
        stock: 100,
        limitPerUser: 3
      },
      scope: { type: ScopeType.PRODUCT, productIds: [productA.id] },
      priority: 100,
      stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
      status: PromotionStatus.ACTIVE,
      startTime: now - oneDay,
      endTime: now + oneDay
    });
    flashSalePromoId = flashSalePromo.id;
  });

  beforeEach(() => {
    seckillQueue.resetUserPurchases();
  });

  describe('Bug Fix 1: 秒杀不能在普通结算中绕过队列', () => {
    test('普通结算不能直接应用秒杀价', () => {
      const cartItems = productService.buildCartItems([
        { productId: productA.id, quantity: 2 }
      ]);

      const result = checkoutService.calculateCart(cartItems);

      const flashSalePromo = result.appliedPromotions.find(
        p => p.type === PromotionType.FLASH_SALE
      );
      expect(flashSalePromo).toBeUndefined();

      expect(result.finalTotal).toBe(100 * 2 * 0.9);
    });

    test('普通结算中秒杀商品仍按常规优惠计算', () => {
      const cartItems = productService.buildCartItems([
        { productId: productA.id, quantity: 1 }
      ]);

      const result = checkoutService.calculateCart(cartItems);

      expect(result.appliedPromotions.length).toBeGreaterThan(0);

      const hasDiscount = result.appliedPromotions.some(
        p => p.type === PromotionType.DISCOUNT
      );
      expect(hasDiscount).toBe(true);

      expect(result.finalTotal).toBeCloseTo(90, 0);
    });
  });

  describe('Bug Fix 2: 活动下线后秒杀抢购立刻失败', () => {
    test('活动下线后抢购应该失败', async () => {
      const testPromo = dataStore.addPromotion({
        name: '待下线秒杀',
        description: '测试下线',
        type: PromotionType.FLASH_SALE,
        config: {
          productId: productB.id,
          salePrice: 100,
          stock: 50,
          limitPerUser: 5
        },
        scope: { type: ScopeType.PRODUCT, productIds: [productB.id] },
        priority: 50,
        stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
        status: PromotionStatus.ACTIVE,
        startTime: Date.now() - 100000,
        endTime: Date.now() + 100000
      });

      const result1 = await submitSeckillRequest(
        'user-test-1',
        testPromo.id,
        productB.id,
        1
      );
      expect(result1.success).toBe(true);
      expect(result1.message).toBe('抢购成功');

      promotionService.deactivatePromotion(testPromo.id);

      const result2 = await submitSeckillRequest(
        'user-test-2',
        testPromo.id,
        productB.id,
        1
      );
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('下线');
    });
  });

  describe('Feature 1: 促销规则试算接口', () => {
    test('试算满减规则效果', () => {
      const testPromo = {
        name: '测试满减',
        type: PromotionType.FULL_REDUCTION,
        config: {
          threshold: 300,
          discountAmount: 50
        },
        scope: {
          type: ScopeType.ALL
        },
        stackingMode: StackingMode.STACKABLE,
        priority: 50
      };

      const cartItems = [
        { productId: productB.id, quantity: 2 }
      ];

      const result = promotionService.previewPromotion(testPromo as any, cartItems);

      expect(result.originalTotal).toBe(400);
      expect(result.finalTotal).toBeLessThan(400);

      const hasFullReduction = result.appliedPromotions.some(
        p => p.promotionName === '测试满减'
      );
      expect(hasFullReduction).toBe(true);
    });

    test('试算秒杀规则效果（不通过队列，预览用）', () => {
      const testPromo = {
        name: '测试秒杀预览',
        type: PromotionType.FLASH_SALE,
        config: {
          productId: productC.id,
          salePrice: 30,
          stock: 100
        },
        scope: {
          type: ScopeType.PRODUCT,
          productIds: [productC.id]
        },
        stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
        priority: 200
      };

      const cartItems = [
        { productId: productC.id, quantity: 2 }
      ];

      const result = promotionService.previewPromotion(testPromo as any, cartItems);

      expect(result.originalTotal).toBe(100);
      expect(result.finalTotal).toBe(60);
      expect(result.totalDiscount).toBe(40);

      const flashPromo = result.appliedPromotions.find(
        p => p.promotionName === '测试秒杀预览'
      );
      expect(flashPromo).toBeDefined();
      expect(flashPromo!.description).toContain('秒杀入口');
    });

    test('试算互斥规则不会和其他规则叠加', () => {
      const testPromo = {
        name: '测试互斥折扣',
        type: PromotionType.DISCOUNT,
        config: {
          discountRate: 0.8
        },
        scope: {
          type: ScopeType.ALL
        },
        stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
        priority: 200
      };

      const cartItems = [
        { productId: productB.id, quantity: 1 }
      ];

      const result = promotionService.previewPromotion(testPromo as any, cartItems);

      expect(result.originalTotal).toBe(200);
      expect(result.finalTotal).toBe(160);
      expect(result.appliedPromotions.length).toBe(1);
      expect(result.appliedPromotions[0].promotionName).toBe('测试互斥折扣');
    });
  });

  describe('Feature 2: 活动创建向导流程', () => {
    test('通过向导创建满减活动', () => {
      const now = Date.now();

      const promotion = promotionService.createFromWizard({
        basicInfo: {
          name: '向导创建的满减活动',
          description: '通过向导创建',
          type: PromotionType.FULL_REDUCTION
        },
        scope: {
          scopeType: 'category',
          categoryIds: ['cat-electronics']
        },
        config: {
          threshold: 500,
          discountAmount: 80
        },
        stacking: {
          priority: 30,
          stackingMode: StackingMode.STACKABLE
        },
        schedule: {
          startTime: now,
          endTime: now + 86400000
        },
        autoActivate: false
      });

      expect(promotion).toBeDefined();
      expect(promotion.name).toBe('向导创建的满减活动');
      expect(promotion.type).toBe(PromotionType.FULL_REDUCTION);
      expect(promotion.status).toBe(PromotionStatus.DRAFT);
      expect(promotion.scope.type).toBe('category');
      expect((promotion.config as any).threshold).toBe(500);
      expect(promotion.priority).toBe(30);
    });

    test('通过向导创建并自动激活活动', () => {
      const now = Date.now();

      const promotion = promotionService.createFromWizard({
        basicInfo: {
          name: '向导创建并激活',
          description: '创建即上线',
          type: PromotionType.DISCOUNT
        },
        scope: {
          scopeType: 'all'
        },
        config: {
          discountRate: 0.85
        },
        schedule: {
          startTime: now,
          endTime: now + 86400000
        },
        autoActivate: true,
        skipApproval: true
      });

      expect(promotion.status).toBe(PromotionStatus.ACTIVE);
    });

    test('通过向导创建买赠活动', () => {
      const now = Date.now();

      const promotion = promotionService.createFromWizard({
        basicInfo: {
          name: '向导买赠活动',
          description: '买A送C',
          type: PromotionType.BUY_GIFT
        },
        scope: {
          scopeType: 'all'
        },
        config: {
          buyProductId: productA.id,
          buyQuantity: 2,
          giftProductId: productC.id,
          giftQuantity: 1
        },
        schedule: {
          startTime: now,
          endTime: now + 86400000
        }
      });

      expect(promotion.type).toBe(PromotionType.BUY_GIFT);
      expect((promotion.config as any).buyProductId).toBe(productA.id);
      expect((promotion.config as any).giftQuantity).toBe(1);
    });
  });

  describe('Feature 3: 销售数据看板', () => {
    test('单个活动销售统计', () => {
      const stats = promotionService.getSalesStats(discountPromoId);

      expect(stats).toBeDefined();
      expect(stats.promotionId).toBe(discountPromoId);
      expect(typeof stats.orderCount).toBe('number');
      expect(typeof stats.totalSales).toBe('number');
      expect(typeof stats.totalDiscount).toBe('number');
    });

    test('全部活动销售统计', () => {
      const allStats = promotionService.getAllSalesStats();

      expect(Array.isArray(allStats)).toBe(true);
      expect(allStats.length).toBeGreaterThan(0);
    });

    test('数据看板总览', () => {
      const overview = promotionService.getStatsOverview();

      expect(overview.totalPromotions).toBeGreaterThan(0);
      expect(overview.activePromotions).toBeGreaterThan(0);
      expect(typeof overview.totalOrders).toBe('number');
      expect(typeof overview.totalSales).toBe('number');
      expect(typeof overview.totalDiscount).toBe('number');
      expect(typeof overview.flashSaleTotalStock).toBe('number');
      expect(typeof overview.flashSaleSoldStock).toBe('number');
      expect(typeof overview.flashSaleRemainingStock).toBe('number');
      expect(Array.isArray(overview.promotionStats)).toBe(true);
    });

    test('秒杀活动统计包含库存信息', () => {
      const stats = promotionService.getSalesStats(flashSalePromoId) as any;

      expect(stats.flashSaleStock).toBeDefined();
      expect(stats.flashSaleStock.totalStock).toBe(100);
      expect(typeof stats.flashSaleRemainingStock).toBe('number');
    });

    test('下单后统计数据更新', () => {
      const beforeStats = promotionService.getSalesStats(discountPromoId);

      const cartItems = productService.buildCartItems([
        { productId: productB.id, quantity: 1 }
      ]);
      checkoutService.createOrder('test-user-stats', cartItems);

      const afterStats = promotionService.getSalesStats(discountPromoId);

      expect(afterStats.orderCount).toBe(beforeStats.orderCount + 1);
      expect(afterStats.totalSales).toBeGreaterThan(beforeStats.totalSales);
    });
  });

  describe('Integration Tests', () => {
    test('普通下单完整流程 - 不包含秒杀', () => {
      const cartItems = productService.buildCartItems([
        { productId: productB.id, quantity: 2 },
        { productId: productC.id, quantity: 3 }
      ]);

      const calcResult = checkoutService.calculateCart(cartItems);
      expect(calcResult.originalTotal).toBe(200 * 2 + 50 * 3);
      expect(calcResult.finalTotal).toBeLessThan(calcResult.originalTotal);
      expect(calcResult.appliedPromotions.length).toBeGreaterThan(0);

      const order = checkoutService.createOrder('integration-user', cartItems);
      expect(order.id).toBeDefined();
      expect(order.originalTotal).toBe(calcResult.originalTotal);
      expect(order.finalTotal).toBe(calcResult.finalTotal);
    });

    test('秒杀抢购完整流程', async () => {
      const testPromo = dataStore.addPromotion({
        name: '集成测试秒杀',
        description: '测试完整流程',
        type: PromotionType.FLASH_SALE,
        config: {
          productId: productC.id,
          salePrice: 25,
          stock: 10,
          limitPerUser: 2
        },
        scope: { type: ScopeType.PRODUCT, productIds: [productC.id] },
        priority: 90,
        stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
        status: PromotionStatus.ACTIVE,
        startTime: Date.now() - 100000,
        endTime: Date.now() + 100000
      });

      const result = await submitSeckillRequest(
        'int-user',
        testPromo.id,
        productC.id,
        2
      );

      expect(result.success).toBe(true);
      expect(result.stock).toBeDefined();
      expect(result.stock?.soldStock).toBe(2);

      const stats = promotionService.getSalesStats(testPromo.id) as any;
      expect(stats.flashSaleStock.soldStock).toBe(2);
      expect(stats.flashSaleRemainingStock).toBe(8);
    });
  });
});
