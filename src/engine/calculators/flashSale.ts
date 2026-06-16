import { Promotion, CartItem, GiftItem, FlashSaleConfig } from '../../types';
import { PromotionCalculator } from './base';
import { ScopeMatcher } from '../scopeMatcher';
import { dataStore } from '../../store/dataStore';

export class FlashSaleCalculator implements PromotionCalculator {
  calculate(
    promotion: Promotion,
    items: CartItem[]
  ): {
    discountAmount: number;
    giftItems: GiftItem[];
    description: string;
    applicableItems: CartItem[];
  } | null {
    const config = promotion.config as FlashSaleConfig;

    const applicableItems = items.filter(item =>
      item.productId === config.productId &&
      ScopeMatcher.isProductInScope(item.product, promotion.scope)
    );

    if (applicableItems.length === 0) return null;

    const flashSaleStock = dataStore.getFlashSaleStock(promotion.id);
    const availableStock = flashSaleStock
      ? flashSaleStock.totalStock - flashSaleStock.soldStock - flashSaleStock.lockedStock
      : 0;

    if (availableStock <= 0) return null;

    const totalRequestedQuantity = applicableItems.reduce((sum, item) => sum + item.quantity, 0);
    const limitedQuantity = Math.min(totalRequestedQuantity, availableStock);

    if (limitedQuantity <= 0) return null;

    const originalPrice = applicableItems[0].unitPrice;
    const discountPerItem = originalPrice - config.salePrice;
    const discountAmount = discountPerItem * limitedQuantity;

    return {
      discountAmount,
      giftItems: [],
      description: `限时秒杀价${config.salePrice}元，省${discountAmount.toFixed(2)}元（限购${limitedQuantity}件）`,
      applicableItems
    };
  }

  static getAvailableStock(promotionId: string): number {
    const stock = dataStore.getFlashSaleStock(promotionId);
    if (!stock) return 0;
    return stock.totalStock - stock.soldStock - stock.lockedStock;
  }
}
