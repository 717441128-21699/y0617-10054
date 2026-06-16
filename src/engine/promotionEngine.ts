import {
  Promotion,
  CartItem,
  CalculationResult,
  AppliedPromotion,
  GiftItem,
  StackingMode,
  PromotionType
} from '../types';
import { CalculatorFactory } from './calculators';
import { dataStore } from '../store/dataStore';

interface PromotionCandidate {
  promotion: Promotion;
  discountAmount: number;
  giftItems: GiftItem[];
  description: string;
}

export class PromotionEngine {
  calculate(cartItems: CartItem[], now: number = Date.now()): CalculationResult {
    const originalTotal = cartItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    );

    const activePromotions = this.getActivePromotions(now);
    const sortedPromotions = this.sortByPriority(activePromotions);

    const { appliedPromotions, totalDiscount, giftItems } = this.computeOptimalCombination(
      sortedPromotions,
      cartItems
    );

    const finalTotal = Math.max(0, originalTotal - totalDiscount);

    return {
      originalTotal,
      finalTotal,
      totalDiscount,
      appliedPromotions,
      giftItems,
      items: cartItems
    };
  }

  private getActivePromotions(now: number): Promotion[] {
    return dataStore.getActivePromotions(now);
  }

  private sortByPriority(promotions: Promotion[]): Promotion[] {
    return [...promotions].sort((a, b) => b.priority - a.priority);
  }

  private computeOptimalCombination(
    sortedPromotions: Promotion[],
    cartItems: CartItem[]
  ): {
    appliedPromotions: AppliedPromotion[];
    totalDiscount: number;
    giftItems: GiftItem[];
  } {
    const appliedPromotions: AppliedPromotion[] = [];
    let totalDiscount = 0;
    const allGiftItems: GiftItem[] = [];
    let hasAppliedMutuallyExclusive = false;

    for (const promotion of sortedPromotions) {
      if (hasAppliedMutuallyExclusive) {
        break;
      }

      if (promotion.stackingMode === StackingMode.MUTUALLY_EXCLUSIVE) {
        if (appliedPromotions.length > 0) {
          continue;
        }
      }

      const calculator = CalculatorFactory.getCalculator(promotion.type);
      if (!calculator) continue;

      const result = calculator.calculate(promotion, cartItems, totalDiscount, appliedPromotions);

      if (!result || result.discountAmount <= 0) continue;

      const appliedPromotion: AppliedPromotion = {
        promotionId: promotion.id,
        promotionName: promotion.name,
        type: promotion.type,
        discountAmount: result.discountAmount,
        giftItems: result.giftItems,
        description: result.description
      };

      appliedPromotions.push(appliedPromotion);
      totalDiscount += result.discountAmount;

      if (result.giftItems.length > 0) {
        allGiftItems.push(...result.giftItems);
      }

      if (promotion.stackingMode === StackingMode.MUTUALLY_EXCLUSIVE) {
        hasAppliedMutuallyExclusive = true;
        break;
      }
    }

    return {
      appliedPromotions,
      totalDiscount,
      giftItems: this.mergeGiftItems(allGiftItems)
    };
  }

  private mergeGiftItems(giftItems: GiftItem[]): GiftItem[] {
    const merged = new Map<string, GiftItem>();

    for (const item of giftItems) {
      const existing = merged.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        merged.set(item.productId, { ...item });
      }
    }

    return Array.from(merged.values());
  }

  getBestPromotionForProduct(
    productId: string,
    categoryId: string,
    price: number,
    now: number = Date.now()
  ): AppliedPromotion | null {
    const cartItem: CartItem = {
      productId,
      quantity: 1,
      unitPrice: price,
      product: {
        id: productId,
        name: '',
        price,
        categoryId,
        stock: 0,
        createdAt: 0
      }
    };

    const result = this.calculate([cartItem], now);

    if (result.appliedPromotions.length === 0) return null;

    return result.appliedPromotions[0];
  }
}

export const promotionEngine = new PromotionEngine();
