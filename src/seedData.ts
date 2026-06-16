import { dataStore } from './store/dataStore';
import { PromotionType, ScopeType, StackingMode, PromotionStatus } from './types';

export function seedSampleData() {
  const productA = dataStore.addProduct({
    name: '商品A',
    price: 100,
    categoryId: 'cat-electronics',
    stock: 1000
  });

  const productB = dataStore.addProduct({
    name: '商品B',
    price: 200,
    categoryId: 'cat-electronics',
    stock: 500
  });

  const productC = dataStore.addProduct({
    name: '商品C',
    price: 50,
    categoryId: 'cat-clothing',
    stock: 200
  });

  const productD = dataStore.addProduct({
    name: '商品D',
    price: 300,
    categoryId: 'cat-clothing',
    stock: 100
  });

  const productE = dataStore.addProduct({
    name: '商品E',
    price: 150,
    categoryId: 'cat-food',
    stock: 800
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

  const buyGiftPromo = dataStore.addPromotion({
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

  const flashSalePromo = dataStore.addPromotion({
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

  console.log('Sample data seeded successfully!');
  console.log(`Products: ${dataStore.getAllProducts().length}`);
  console.log(`Promotions: ${dataStore.getAllPromotions().length}`);

  return {
    products: [productA, productB, productC, productD, productE],
    flashSalePromo
  };
}

let buyGiftPromo: any;
let flashSalePromo: any;

export { buyGiftPromo, flashSalePromo };
