import { Promotion, CartItem, AppliedPromotion, GiftItem } from '../../types';

export interface PromotionCalculator {
  calculate(
    promotion: Promotion,
    items: CartItem[],
    currentTotal: number,
    appliedPromotions: AppliedPromotion[]
  ): {
    discountAmount: number;
    giftItems: GiftItem[];
    description: string;
    applicableItems: CartItem[];
  } | null;
}
