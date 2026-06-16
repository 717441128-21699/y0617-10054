import { CartItem, CalculationResult, Order } from '../types';
import { promotionEngine } from '../engine/promotionEngine';
import { dataStore } from '../store/dataStore';

export class CheckoutService {
  calculateCart(cartItems: CartItem[], now: number = Date.now()): CalculationResult {
    return promotionEngine.calculate(cartItems, now);
  }

  createOrder(
    userId: string,
    cartItems: CartItem[],
    now: number = Date.now()
  ): Order {
    const calculationResult = this.calculateCart(cartItems, now);

    const order = dataStore.addOrder({
      userId,
      items: calculationResult.items,
      originalTotal: calculationResult.originalTotal,
      finalTotal: calculationResult.finalTotal,
      appliedPromotions: calculationResult.appliedPromotions,
      giftItems: calculationResult.giftItems,
      status: 'pending'
    });

    return order;
  }
}

export const checkoutService = new CheckoutService();
