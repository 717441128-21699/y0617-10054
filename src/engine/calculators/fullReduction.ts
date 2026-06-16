import { Promotion, CartItem, GiftItem, FullReductionConfig } from '../../types';
import { PromotionCalculator } from './base';
import { ScopeMatcher } from '../scopeMatcher';

export class FullReductionCalculator implements PromotionCalculator {
  calculate(
    promotion: Promotion,
    items: CartItem[]
  ): {
    discountAmount: number;
    giftItems: GiftItem[];
    description: string;
    applicableItems: CartItem[];
  } | null {
    const config = promotion.config as FullReductionConfig;
    const applicableItems = ScopeMatcher.filterItemsByScope(items, promotion.scope);

    if (applicableItems.length === 0) return null;

    const applicableTotal = ScopeMatcher.calculateItemsTotal(applicableItems);

    if (applicableTotal < config.threshold) return null;

    let times = Math.floor(applicableTotal / config.threshold);
    if (config.maxDiscountTimes !== undefined) {
      times = Math.min(times, config.maxDiscountTimes);
    }

    const discountAmount = times * config.discountAmount;

    return {
      discountAmount,
      giftItems: [],
      description: `满${config.threshold}减${config.discountAmount}，共减${discountAmount}元`,
      applicableItems
    };
  }
}
