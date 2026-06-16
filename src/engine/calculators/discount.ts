import { Promotion, CartItem, GiftItem, DiscountConfig } from '../../types';
import { PromotionCalculator } from './base';
import { ScopeMatcher } from '../scopeMatcher';

export class DiscountCalculator implements PromotionCalculator {
  calculate(
    promotion: Promotion,
    items: CartItem[]
  ): {
    discountAmount: number;
    giftItems: GiftItem[];
    description: string;
    applicableItems: CartItem[];
  } | null {
    const config = promotion.config as DiscountConfig;
    const applicableItems = ScopeMatcher.filterItemsByScope(items, promotion.scope);

    if (applicableItems.length === 0) return null;

    const applicableTotal = ScopeMatcher.calculateItemsTotal(applicableItems);

    let discountAmount = applicableTotal * (1 - config.discountRate);

    if (config.maxDiscountAmount !== undefined) {
      discountAmount = Math.min(discountAmount, config.maxDiscountAmount);
    }

    return {
      discountAmount,
      giftItems: [],
      description: `${(config.discountRate * 10).toFixed(1)}折优惠，省${discountAmount.toFixed(2)}元`,
      applicableItems
    };
  }
}
