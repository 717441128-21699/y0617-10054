import { v4 as uuidv4 } from 'uuid';
import {
  Product,
  Promotion,
  FlashSaleStock,
  Order,
  SalesStats,
  PromotionStatus
} from '../types';

class DataStore {
  private products: Map<string, Product> = new Map();
  private promotions: Map<string, Promotion> = new Map();
  private flashSaleStocks: Map<string, FlashSaleStock> = new Map();
  private orders: Order[] = [];

  generateId(): string {
    return uuidv4();
  }

  addProduct(product: Omit<Product, 'id' | 'createdAt'>): Product {
    const id = this.generateId();
    const newProduct: Product = {
      ...product,
      id,
      createdAt: Date.now()
    };
    this.products.set(id, newProduct);
    return newProduct;
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  getAllProducts(): Product[] {
    return Array.from(this.products.values());
  }

  updateProduct(id: string, updates: Partial<Product>): Product | undefined {
    const product = this.products.get(id);
    if (!product) return undefined;
    const updated = { ...product, ...updates };
    this.products.set(id, updated);
    return updated;
  }

  addPromotion(promotion: Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>): Promotion {
    const id = this.generateId();
    const now = Date.now();
    const newPromotion: Promotion = {
      ...promotion,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.promotions.set(id, newPromotion);

    if (promotion.type === 'flash_sale') {
      const config = promotion.config as { productId: string; stock: number };
      this.flashSaleStocks.set(id, {
        promotionId: id,
        productId: config.productId,
        totalStock: config.stock,
        soldStock: 0,
        lockedStock: 0
      });
    }

    return newPromotion;
  }

  getPromotion(id: string): Promotion | undefined {
    return this.promotions.get(id);
  }

  getAllPromotions(): Promotion[] {
    return Array.from(this.promotions.values());
  }

  getActivePromotions(now: number = Date.now()): Promotion[] {
    return Array.from(this.promotions.values()).filter(p =>
      p.status === PromotionStatus.ACTIVE &&
      p.startTime <= now &&
      p.endTime >= now
    );
  }

  updatePromotion(id: string, updates: Partial<Promotion>): Promotion | undefined {
    const promotion = this.promotions.get(id);
    if (!promotion) return undefined;
    const updated = { ...promotion, ...updates, updatedAt: Date.now() };
    this.promotions.set(id, updated);
    return updated;
  }

  deletePromotion(id: string): boolean {
    return this.promotions.delete(id);
  }

  getFlashSaleStock(promotionId: string): FlashSaleStock | undefined {
    return this.flashSaleStocks.get(promotionId);
  }

  updateFlashSaleStock(promotionId: string, updates: Partial<FlashSaleStock>): FlashSaleStock | undefined {
    const stock = this.flashSaleStocks.get(promotionId);
    if (!stock) return undefined;
    const updated = { ...stock, ...updates };
    this.flashSaleStocks.set(promotionId, updated);
    return updated;
  }

  addOrder(order: Omit<Order, 'id' | 'createdAt'>): Order {
    const id = this.generateId();
    const newOrder: Order = {
      ...order,
      id,
      createdAt: Date.now()
    };
    this.orders.push(newOrder);
    return newOrder;
  }

  getOrdersByPromotion(promotionId: string): Order[] {
    return this.orders.filter(o =>
      o.appliedPromotions.some(p => p.promotionId === promotionId)
    );
  }

  getSalesStats(promotionId: string): SalesStats {
    const orders = this.getOrdersByPromotion(promotionId);
    const promotion = this.getPromotion(promotionId);

    let totalSales = 0;
    let totalDiscount = 0;
    let flashSaleSold = 0;

    orders.forEach(order => {
      totalSales += order.finalTotal;
      const promo = order.appliedPromotions.find(p => p.promotionId === promotionId);
      if (promo) {
        totalDiscount += promo.discountAmount;
      }
      if (promotion?.type === 'flash_sale') {
        order.items.forEach(item => {
          if (promotion && 'productId' in promotion.config &&
              item.productId === (promotion.config as any).productId) {
            flashSaleSold += item.quantity;
          }
        });
      }
    });

    const stats: SalesStats = {
      promotionId,
      orderCount: orders.length,
      totalSales,
      totalDiscount
    };

    if (promotion?.type === 'flash_sale') {
      stats.flashSaleSold = flashSaleSold;
    }

    return stats;
  }

  getAllOrders(): Order[] {
    return [...this.orders];
  }
}

export const dataStore = new DataStore();
