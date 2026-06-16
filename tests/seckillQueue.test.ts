import { dataStore } from '../src/store/dataStore';
import { seckillQueue, SeckillResult } from '../src/services/seckillQueue';
import { PromotionType, ScopeType, StackingMode, PromotionStatus, Product } from '../src/types';

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

function createTestPromotion(
  product: Product,
  stock: number,
  limitPerUser?: number
): string {
  const promotion = dataStore.addPromotion({
    name: `测试秒杀-${Date.now()}`,
    description: '测试秒杀活动',
    type: PromotionType.FLASH_SALE,
    config: {
      productId: product.id,
      salePrice: 80,
      stock,
      limitPerUser
    },
    scope: {
      type: ScopeType.PRODUCT,
      productIds: [product.id]
    },
    priority: 100,
    stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
    status: PromotionStatus.ACTIVE,
    startTime: Date.now() - 1000,
    endTime: Date.now() + 100000
  });

  return promotion.id;
}

describe('Seckill Queue - Flash Sale', () => {
  let product: Product;

  beforeAll(() => {
    product = dataStore.addProduct({
      name: '秒杀商品',
      price: 100,
      categoryId: 'cat-test',
      stock: 1000
    });
  });

  beforeEach(() => {
    seckillQueue.resetUserPurchases();
  });

  test('单次抢购成功', async () => {
    const promotionId = createTestPromotion(product, 10, 5);

    const result = await submitSeckillRequest('user-1', promotionId, product.id, 1);

    expect(result.success).toBe(true);
    expect(result.message).toBe('抢购成功');
  });

  test('库存扣减正确', async () => {
    const promotionId = createTestPromotion(product, 10, 5);

    const stockBefore = dataStore.getFlashSaleStock(promotionId);
    const soldBefore = stockBefore?.soldStock || 0;

    const result = await submitSeckillRequest('user-2', promotionId, product.id, 3);

    expect(result.success).toBe(true);

    const stockAfter = dataStore.getFlashSaleStock(promotionId);
    expect(stockAfter?.soldStock).toBe(soldBefore + 3);
  });

  test('超出限购数量失败', async () => {
    const promotionId = createTestPromotion(product, 10, 2);

    const result = await submitSeckillRequest('user-3', promotionId, product.id, 3);

    expect(result.success).toBe(false);
    expect(result.message).toContain('限购');
  });

  test('用户累计购买量不能超过限购', async () => {
    const promotionId = createTestPromotion(product, 10, 2);

    const result1 = await submitSeckillRequest('user-4', promotionId, product.id, 1);
    expect(result1.success).toBe(true);

    const result2 = await submitSeckillRequest('user-4', promotionId, product.id, 2);
    expect(result2.success).toBe(false);
    expect(result2.message).toContain('限购');
  });

  test('库存不足时抢购失败', async () => {
    const promotionId = createTestPromotion(product, 3, 10);

    await submitSeckillRequest('user-5a', promotionId, product.id, 2);

    const result = await submitSeckillRequest('user-5b', promotionId, product.id, 2);

    expect(result.success).toBe(false);
    expect(result.message).toContain('库存不足');
  });

  test('并发抢购不会超卖', async () => {
    const testStock = 5;
    const promotionId = createTestPromotion(product, testStock, 10);

    const totalRequests = 10;
    const promises: Promise<SeckillResult>[] = [];

    for (let i = 0; i < totalRequests; i++) {
      promises.push(
        submitSeckillRequest(`user-concurrent-${i}`, promotionId, product.id, 1)
      );
    }

    const results = await Promise.all(promises);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    expect(successCount).toBe(testStock);
    expect(failCount).toBe(totalRequests - testStock);

    const finalStock = dataStore.getFlashSaleStock(promotionId);
    expect(finalStock?.soldStock).toBe(testStock);
  });

  test('获取库存信息正确', () => {
    const promotionId = createTestPromotion(product, 10, 5);
    const stock = seckillQueue.getStockInfo(promotionId);

    expect(stock).toBeDefined();
    expect(stock?.totalStock).toBe(10);
    expect(stock?.soldStock).toBe(0);
  });

  test('活动未开始时抢购失败', async () => {
    const promotion = dataStore.addPromotion({
      name: '未开始的秒杀',
      description: '测试',
      type: PromotionType.FLASH_SALE,
      config: {
        productId: product.id,
        salePrice: 50,
        stock: 10,
        limitPerUser: 2
      },
      scope: {
        type: ScopeType.PRODUCT,
        productIds: [product.id]
      },
      priority: 100,
      stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
      status: PromotionStatus.ACTIVE,
      startTime: Date.now() + 100000,
      endTime: Date.now() + 200000
    });

    const result = await submitSeckillRequest('user-6', promotion.id, product.id, 1);

    expect(result.success).toBe(false);
    expect(result.message).toContain('尚未开始');
  });
});
