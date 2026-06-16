import { dataStore } from '../src/store/dataStore';
import { PromotionType, ScopeType, StackingMode, PromotionStatus, Product } from '../src/types';
import { promotionEngine } from '../src/engine/promotionEngine';
import { productService } from '../src/services/productService';
import { checkoutService } from '../src/services/checkoutService';

describe('Promotion Engine - Discount Rules', () => {
  let productA: Product;
  let productB: Product;
  let productC: Product;
  let productD: Product;

  beforeAll(() => {
    productA = dataStore.addProduct({
      name: '商品A',
      price: 100,
      categoryId: 'cat-electronics',
      stock: 1000
    });

    productB = dataStore.addProduct({
      name: '商品B',
      price: 200,
      categoryId: 'cat-electronics',
      stock: 500
    });

    productC = dataStore.addProduct({
      name: '商品C',
      price: 50,
      categoryId: 'cat-clothing',
      stock: 200
    });

    productD = dataStore.addProduct({
      name: '商品D',
      price: 300,
      categoryId: 'cat-food',
      stock: 100
    });

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    dataStore.addPromotion({
      name: '全场9折优惠',
      description: '全场商品9折',
      type: PromotionType.DISCOUNT,
      config: {
        discountRate: 0.9,
        maxDiscountAmount: 200
      },
      scope: {
        type: ScopeType.ALL
      },
      priority: 10,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now - oneDay,
      endTime: now + oneDay * 7
    });

    dataStore.addPromotion({
      name: '满200减50',
      description: '全场满200元减50元',
      type: PromotionType.FULL_REDUCTION,
      config: {
        threshold: 200,
        discountAmount: 50,
        maxDiscountTimes: 3
      },
      scope: {
        type: ScopeType.ALL
      },
      priority: 20,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now - oneDay,
      endTime: now + oneDay * 7
    });

    dataStore.addPromotion({
      name: '电子产品满100减20',
      description: '电子产品满100减20',
      type: PromotionType.FULL_REDUCTION,
      config: {
        threshold: 100,
        discountAmount: 20
      },
      scope: {
        type: ScopeType.CATEGORY,
        categoryIds: ['cat-electronics']
      },
      priority: 15,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now - oneDay,
      endTime: now + oneDay * 7
    });

    dataStore.addPromotion({
      name: '买A送C',
      description: '买1件商品A送1件商品C',
      type: PromotionType.BUY_GIFT,
      config: {
        buyProductId: productA.id,
        buyQuantity: 1,
        giftProductId: productC.id,
        giftQuantity: 1,
        maxGiftTimes: 3
      },
      scope: {
        type: ScopeType.ALL
      },
      priority: 5,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now - oneDay,
      endTime: now + oneDay * 7
    });

    dataStore.addPromotion({
      name: '买B送D',
      description: '买1件商品B送1件商品D',
      type: PromotionType.BUY_GIFT,
      config: {
        buyProductId: productB.id,
        buyQuantity: 1,
        giftProductId: productD.id,
        giftQuantity: 1,
        maxGiftTimes: 5
      },
      scope: {
        type: ScopeType.ALL
      },
      priority: 5,
      stackingMode: StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: now - oneDay,
      endTime: now + oneDay * 7
    });

    dataStore.addPromotion({
      name: '限时秒杀-商品A',
      description: '商品A限时秒杀价80元',
      type: PromotionType.FLASH_SALE,
      config: {
        productId: productA.id,
        salePrice: 80,
        stock: 50,
        limitPerUser: 2
      },
      scope: {
        type: ScopeType.PRODUCT,
        productIds: [productA.id]
      },
      priority: 100,
      stackingMode: StackingMode.MUTUALLY_EXCLUSIVE,
      status: PromotionStatus.ACTIVE,
      startTime: now - oneDay,
      endTime: now + oneDay * 7
    });
  });

  test('全场9折优惠计算正确', () => {
    const cartItems = productService.buildCartItems([
      { productId: productD.id, quantity: 1 }
    ]);

    const result = promotionEngine.calculate(cartItems);

    expect(result.originalTotal).toBe(300);

    const discountPromo = result.appliedPromotions.find(p => p.type === PromotionType.DISCOUNT);
    expect(discountPromo).toBeDefined();
    expect(discountPromo!.discountAmount).toBeCloseTo(30, 1);
  });

  test('满200减50计算正确', () => {
    const cartItems = productService.buildCartItems([
      { productId: productD.id, quantity: 1 }
    ]);

    const result = promotionEngine.calculate(cartItems);

    expect(result.originalTotal).toBe(300);

    const fullReductionPromo = result.appliedPromotions.find(
      p => p.type === PromotionType.FULL_REDUCTION && p.promotionName === '满200减50'
    );
    expect(fullReductionPromo).toBeDefined();
    expect(fullReductionPromo!.discountAmount).toBe(50);
  });

  test('折扣和满减叠加计算', () => {
    const cartItems = productService.buildCartItems([
      { productId: productD.id, quantity: 1 }
    ]);

    const result = promotionEngine.calculate(cartItems);

    const hasDiscount = result.appliedPromotions.some(p => p.type === PromotionType.DISCOUNT);
    const hasFullReduction = result.appliedPromotions.some(p => p.type === PromotionType.FULL_REDUCTION);

    expect(hasDiscount && hasFullReduction).toBe(true);
    expect(result.totalDiscount).toBeGreaterThan(50);
    expect(result.finalTotal).toBe(300 - 30 - 50);
  });

  test('分类范围的满减只适用于指定分类', () => {
    const cartItems = productService.buildCartItems([
      { productId: productD.id, quantity: 2 }
    ]);

    const result = promotionEngine.calculate(cartItems);

    const electronicsPromo = result.appliedPromotions.find(
      p => p.promotionName === '电子产品满100减20'
    );
    expect(electronicsPromo).toBeUndefined();
  });

  test('分类范围的满减适用于对应分类商品', () => {
    const cartItems = productService.buildCartItems([
      { productId: productB.id, quantity: 1 }
    ]);

    const result = promotionEngine.calculate(cartItems);

    const electronicsPromo = result.appliedPromotions.find(
      p => p.promotionName === '电子产品满100减20'
    );
    expect(electronicsPromo).toBeDefined();
  });

  test('买赠活动计算正确', () => {
    const cartItems = productService.buildCartItems([
      { productId: productB.id, quantity: 2 }
    ]);

    const result = promotionEngine.calculate(cartItems);

    const buyGiftPromo = result.appliedPromotions.find(
      p => p.type === PromotionType.BUY_GIFT
    );
    expect(buyGiftPromo).toBeDefined();

    expect(result.giftItems.length).toBeGreaterThan(0);
    expect(result.giftItems[0].productId).toBe(productD.id);
    expect(result.giftItems[0].quantity).toBe(2);
  });

  test('秒杀活动优先级最高且互斥', () => {
    const cartItems = productService.buildCartItems([
      { productId: productA.id, quantity: 1 }
    ]);

    const result = promotionEngine.calculate(cartItems);

    const flashSalePromo = result.appliedPromotions.find(
      p => p.type === PromotionType.FLASH_SALE
    );
    expect(flashSalePromo).toBeDefined();
    expect(flashSalePromo!.discountAmount).toBe(20);

    const discountPromo = result.appliedPromotions.find(p => p.type === PromotionType.DISCOUNT);
    expect(discountPromo).toBeUndefined();

    const fullReductionPromo = result.appliedPromotions.find(p => p.type === PromotionType.FULL_REDUCTION);
    expect(fullReductionPromo).toBeUndefined();
  });

  test('订单创建正确', () => {
    const cartItems = productService.buildCartItems([
      { productId: productB.id, quantity: 1 },
      { productId: productC.id, quantity: 2 }
    ]);

    const order = checkoutService.createOrder('user-1', cartItems);

    expect(order).toBeDefined();
    expect(order.id).toBeDefined();
    expect(order.userId).toBe('user-1');
    expect(order.items.length).toBe(2);
    expect(order.appliedPromotions.length).toBeGreaterThan(0);
    expect(order.finalTotal).toBeLessThan(order.originalTotal);
  });

  test('促销时间范围过滤正确', () => {
    const pastTime = Date.now() - 48 * 60 * 60 * 1000;
    const cartItems = productService.buildCartItems([
      { productId: productD.id, quantity: 1 }
    ]);

    const result = promotionEngine.calculate(cartItems, pastTime);

    expect(result.appliedPromotions.length).toBe(0);
    expect(result.finalTotal).toBe(result.originalTotal);
  });
});
