import { Promotion, CartItem, PromotionScope, ScopeType } from '../types';

export class ScopeMatcher {
  static isProductInScope(product: { id: string; categoryId: string }, scope: PromotionScope): boolean {
    switch (scope.type) {
      case ScopeType.ALL:
        return true;
      case ScopeType.CATEGORY:
        return scope.categoryIds?.includes(product.categoryId) ?? false;
      case ScopeType.PRODUCT:
        return scope.productIds?.includes(product.id) ?? false;
      default:
        return false;
    }
  }

  static filterItemsByScope(items: CartItem[], scope: PromotionScope): CartItem[] {
    return items.filter(item =>
      this.isProductInScope(item.product, scope)
    );
  }

  static calculateItemsTotal(items: CartItem[]): number {
    return items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  }
}
