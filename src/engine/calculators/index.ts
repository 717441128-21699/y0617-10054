import { PromotionType } from '../../types';
import { PromotionCalculator } from './base';
import { FullReductionCalculator } from './fullReduction';
import { DiscountCalculator } from './discount';
import { BuyGiftCalculator } from './buyGift';
import { FlashSaleCalculator } from './flashSale';

export class CalculatorFactory {
  private static calculators: Map<PromotionType, PromotionCalculator> = new Map([
    [PromotionType.FULL_REDUCTION, new FullReductionCalculator()],
    [PromotionType.DISCOUNT, new DiscountCalculator()],
    [PromotionType.BUY_GIFT, new BuyGiftCalculator()],
    [PromotionType.FLASH_SALE, new FlashSaleCalculator()]
  ]);

  static getCalculator(type: PromotionType): PromotionCalculator | undefined {
    return this.calculators.get(type);
  }
}
