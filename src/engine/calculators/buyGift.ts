import { Promotion, CartItem, GiftItem, BuyGiftConfig } from '../../types';
import { PromotionCalculator } from './base';
import { ScopeMatcher } from '../scopeMatcher';
import { dataStore } from '../../store/dataStore';

export class BuyGiftCalculator implements PromotionCalculator {
  calculate(
    promotion: Promotion,
    items: CartItem[]
  ): {
    discountAmount: number;
    giftItems: GiftItem[];
    description: string;
    applicableItems: CartItem[];
  } | null {
    const config = promotion.config as BuyGiftConfig;

    const applicableItems = items.filter(item =>
      item.productId === config.buyProductId &&
      ScopeMatcher.isProductInScope(item.product, promotion.scope)
    );

    if (applicableItems.length === 0) return null;

    const totalBuyQuantity = applicableItems.reduce((sum, item) => sum + item.quantity, 0);

    if (totalBuyQuantity < config.buyQuantity) return null;

    let giftTimes = Math.floor(totalBuyQuantity / config.buyQuantity);
    if (config.maxGiftTimes !== undefined) {
      giftTimes = Math.min(giftTimes, config.maxGiftTimes);
    }

    const giftProduct = dataStore.getProduct(config.giftProductId);
    const giftProductName = giftProduct?.name || config.giftProductId;
    const giftItemPrice = giftProduct?.price || 0;

    const giftItems: GiftItem[] = [{
      productId: config.giftProductId,
      productName: giftProductName,
      quantity: giftTimes * config.giftQuantity
    }];

    const discountAmount = giftItemPrice * giftTimes * config.giftQuantity;

    return {
      discountAmount,
      giftItems,
      description: `买${config.buyQuantity}件${config.buyProductId}送${config.giftQuantity}件${giftProductName}，共送${giftTimes * config.giftQuantity}件`,
      applicableItems
    };
  }
}
