import { v4 as uuidv4 } from 'uuid';
import {
  Product,
  Promotion,
  FlashSaleStock,
  Order,
  SalesStats,
  PromotionStatus,
  PromotionVersion,
  VersionChangeType
} from '../types';

class DataStore {
  private products: Map<string, Product> = new Map();
  private promotions: Map<string, Promotion> = new Map();
  private flashSaleStocks: Map<string, FlashSaleStock> = new Map();
  private orders: Order[] = [];
  private versions: Map<string, PromotionVersion[]> = new Map();
  private versionCounters: Map<string, number> = new Map();

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

  addPromotion(
    promotion: Omit<Promotion, 'id' | 'createdAt' | 'updatedAt'>,
    options?: { operatorId?: string; changeDescription?: string }
  ): Promotion {
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

    this.createVersion(id, newPromotion, VersionChangeType.CREATE, {
      operatorId: options?.operatorId,
      changeDescription: options?.changeDescription || '创建活动'
    });

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

  updatePromotion(
    id: string,
    updates: Partial<Promotion>,
    options?: { operatorId?: string; changeDescription?: string }
  ): Promotion | undefined {
    const promotion = this.promotions.get(id);
    if (!promotion) return undefined;
    const updated = { ...promotion, ...updates, updatedAt: Date.now() };
    this.promotions.set(id, updated);

    this.createVersion(id, updated, VersionChangeType.UPDATE, {
      operatorId: options?.operatorId,
      changeDescription: options?.changeDescription || '更新活动'
    });

    return updated;
  }

  deletePromotion(id: string): boolean {
    this.versions.delete(id);
    this.versionCounters.delete(id);
    this.flashSaleStocks.delete(id);
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

  getOrdersByPromotion(promotionId: string, timeRange?: { startTime?: number; endTime?: number }): Order[] {
    let orders = this.orders.filter(o =>
      o.appliedPromotions.some(p => p.promotionId === promotionId)
    );

    if (timeRange) {
      if (timeRange.startTime !== undefined) {
        orders = orders.filter(o => o.createdAt >= timeRange.startTime!);
      }
      if (timeRange.endTime !== undefined) {
        orders = orders.filter(o => o.createdAt <= timeRange.endTime!);
      }
    }

    return orders;
  }

  getSalesStats(promotionId: string, timeRange?: { startTime?: number; endTime?: number }): SalesStats {
    const orders = this.getOrdersByPromotion(promotionId, timeRange);
    const promotion = this.getPromotion(promotionId);
    const flashSaleStock = this.getFlashSaleStock(promotionId);

    let totalSales = 0;
    let totalDiscount = 0;
    let flashSaleSold = 0;

    orders.forEach(order => {
      totalSales += order.finalTotal;
      const promo = order.appliedPromotions.find(p => p.promotionId === promotionId);
      if (promo) {
        totalDiscount += promo.discountAmount;
      }
    });

    if (flashSaleStock) {
      flashSaleSold = flashSaleStock.soldStock;
    }

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

  getAllOrders(timeRange?: { startTime?: number; endTime?: number }): Order[] {
    let orders = [...this.orders];
    if (timeRange) {
      if (timeRange.startTime !== undefined) {
        orders = orders.filter(o => o.createdAt >= timeRange.startTime!);
      }
      if (timeRange.endTime !== undefined) {
        orders = orders.filter(o => o.createdAt <= timeRange.endTime!);
      }
    }
    return orders;
  }

  private createVersion(
    promotionId: string,
    promotion: Promotion,
    changeType: VersionChangeType,
    options?: { operatorId?: string; changeDescription?: string }
  ): PromotionVersion {
    const versionNum = (this.versionCounters.get(promotionId) || 0) + 1;
    this.versionCounters.set(promotionId, versionNum);

    const version: PromotionVersion = {
      id: this.generateId(),
      promotionId,
      version: versionNum,
      name: promotion.name,
      description: promotion.description,
      type: promotion.type,
      config: JSON.parse(JSON.stringify(promotion.config)),
      scope: JSON.parse(JSON.stringify(promotion.scope)),
      priority: promotion.priority,
      stackingMode: promotion.stackingMode,
      status: promotion.status,
      startTime: promotion.startTime,
      endTime: promotion.endTime,
      changeType,
      changeDescription: options?.changeDescription,
      operatorId: options?.operatorId,
      createdAt: Date.now()
    };

    if (!this.versions.has(promotionId)) {
      this.versions.set(promotionId, []);
    }
    this.versions.get(promotionId)!.push(version);

    return version;
  }

  getVersions(promotionId: string): PromotionVersion[] {
    const versions = this.versions.get(promotionId) || [];
    return [...versions].sort((a, b) => b.version - a.version);
  }

  getVersion(promotionId: string, versionNumber: number): PromotionVersion | undefined {
    const versions = this.versions.get(promotionId) || [];
    return versions.find(v => v.version === versionNumber);
  }

  rollbackToVersion(
    promotionId: string,
    versionNumber: number,
    options?: { operatorId?: string }
  ): Promotion | undefined {
    const version = this.getVersion(promotionId, versionNumber);
    if (!version) return undefined;

    const promotion = this.promotions.get(promotionId);
    if (!promotion) return undefined;

    const rolledBack: Promotion = {
      ...promotion,
      name: version.name,
      description: version.description,
      type: version.type,
      config: JSON.parse(JSON.stringify(version.config)),
      scope: JSON.parse(JSON.stringify(version.scope)),
      priority: version.priority,
      stackingMode: version.stackingMode,
      status: version.status,
      startTime: version.startTime,
      endTime: version.endTime,
      updatedAt: Date.now()
    };

    this.promotions.set(promotionId, rolledBack);

    this.createVersion(promotionId, rolledBack, VersionChangeType.ROLLBACK, {
      operatorId: options?.operatorId,
      changeDescription: `回滚到版本 v${versionNumber}`
    });

    return rolledBack;
  }

  submitForApproval(
    promotionId: string,
    options?: { operatorId?: string; changeDescription?: string }
  ): Promotion | undefined {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) return undefined;

    const updated = { ...promotion, status: PromotionStatus.PENDING_APPROVAL, updatedAt: Date.now() };
    this.promotions.set(promotionId, updated);

    this.createVersion(promotionId, updated, VersionChangeType.UPDATE, {
      operatorId: options?.operatorId,
      changeDescription: options?.changeDescription || '提交审批'
    });

    return updated;
  }

  approvePromotion(
    promotionId: string,
    options?: { operatorId?: string; changeDescription?: string; activate?: boolean }
  ): Promotion | undefined {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) return undefined;

    const newStatus = options?.activate ? PromotionStatus.ACTIVE : PromotionStatus.INACTIVE;
    const updated = { ...promotion, status: newStatus, updatedAt: Date.now() };
    this.promotions.set(promotionId, updated);

    this.createVersion(promotionId, updated, VersionChangeType.APPROVE, {
      operatorId: options?.operatorId,
      changeDescription: options?.changeDescription || `审批通过${options?.activate ? '并上线' : ''}`
    });

    return updated;
  }

  rejectPromotion(
    promotionId: string,
    options?: { operatorId?: string; rejectReason?: string }
  ): Promotion | undefined {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) return undefined;

    const updated = { ...promotion, status: PromotionStatus.DRAFT, updatedAt: Date.now() };
    this.promotions.set(promotionId, updated);

    this.createVersion(promotionId, updated, VersionChangeType.REJECT, {
      operatorId: options?.operatorId,
      changeDescription: options?.rejectReason || '审批被驳回'
    });

    return updated;
  }
}

export const dataStore = new DataStore();
