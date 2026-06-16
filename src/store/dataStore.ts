import { v4 as uuidv4 } from 'uuid';
import {
  Product,
  Promotion,
  FlashSaleStock,
  Order,
  SalesStats,
  PromotionStatus,
  PromotionVersion,
  VersionChangeType,
  VersionStatus,
  DashboardFilter,
  PromotionEffectAnalysis
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
    promotion: Omit<Promotion, 'id' | 'createdAt' | 'updatedAt' | 'activeVersion'>,
    options?: { operatorId?: string; changeDescription?: string }
  ): Promotion {
    const id = this.generateId();
    const now = Date.now();
    const newPromotion: Promotion = {
      ...promotion,
      id,
      createdAt: now,
      updatedAt: now,
      activeVersion: promotion.status === PromotionStatus.ACTIVE ? 1 : undefined,
      operatorId: options?.operatorId
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

    const versionStatus = this.getInitialVersionStatus(promotion.status);
    this.createVersion(id, newPromotion, VersionChangeType.CREATE, {
      operatorId: options?.operatorId,
      changeDescription: options?.changeDescription || '创建活动',
      versionStatus
    });

    return newPromotion;
  }

  private getInitialVersionStatus(status: PromotionStatus): VersionStatus {
    switch (status) {
      case PromotionStatus.ACTIVE:
      case PromotionStatus.INACTIVE:
        return VersionStatus.EFFECTIVE;
      case PromotionStatus.PENDING_APPROVAL:
        return VersionStatus.PENDING_APPROVAL;
      case PromotionStatus.DRAFT:
      default:
        return VersionStatus.DRAFT;
    }
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

    const isActive = promotion.status === PromotionStatus.ACTIVE;
    const now = Date.now();

    if (isActive) {
      const newVersionNum = (this.versionCounters.get(id) || 0) + 1;
      const draftPromotion: Promotion = {
        ...promotion,
        ...updates,
        status: PromotionStatus.DRAFT,
        updatedAt: now
      };

      this.promotions.set(id, draftPromotion);

      this.createVersion(id, draftPromotion, VersionChangeType.UPDATE, {
        operatorId: options?.operatorId,
        changeDescription: options?.changeDescription || '编辑已上线活动，创建草稿版本',
        versionStatus: VersionStatus.DRAFT,
        parentVersion: promotion.activeVersion
      });

      return draftPromotion;
    } else {
      const updated = { ...promotion, ...updates, updatedAt: now };
      this.promotions.set(id, updated);

      const currentVersionNum = this.versionCounters.get(id) || 0;
      const currentVersion = this.getVersion(id, currentVersionNum);
      const versionStatus = currentVersion?.versionStatus === VersionStatus.EFFECTIVE
        ? VersionStatus.EFFECTIVE
        : VersionStatus.DRAFT;

      this.createVersion(id, updated, VersionChangeType.UPDATE, {
        operatorId: options?.operatorId,
        changeDescription: options?.changeDescription || '更新活动',
        versionStatus,
        parentVersion: currentVersionNum
      });

      return updated;
    }
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

  getEffectAnalysis(filter: DashboardFilter): PromotionEffectAnalysis {
    let promotions = this.getAllPromotions();

    if (filter.promotionType) {
      promotions = promotions.filter(p => p.type === filter.promotionType);
    }

    if (filter.operatorId) {
      promotions = promotions.filter(p => p.operatorId === filter.operatorId);
    }

    if (filter.status && filter.status.length > 0) {
      promotions = promotions.filter(p => filter.status!.includes(p.status));
    }

    if (filter.categoryId) {
      promotions = promotions.filter(p => {
        if (p.scope.type === 'all') return true;
        if (p.scope.type === 'category') {
          return p.scope.categoryIds?.includes(filter.categoryId!);
        }
        if (p.scope.type === 'product') {
          return p.scope.productIds?.some(pid => {
            const product = this.getProduct(pid);
            return product?.categoryId === filter.categoryId;
          });
        }
        return false;
      });
    }

    const timeRange = {
      startTime: filter.startTime,
      endTime: filter.endTime
    };

    let totalOrders = 0;
    let totalSales = 0;
    let totalDiscount = 0;
    let flashSaleTotalStock = 0;
    let flashSaleRemainingStock = 0;
    const promotionStats: SalesStats[] = [];

    promotions.forEach(promo => {
      const stats = this.getSalesStats(promo.id, timeRange);
      promotionStats.push(stats);
      totalOrders += stats.orderCount;
      totalSales += stats.totalSales;
      totalDiscount += stats.totalDiscount;

      if (promo.type === 'flash_sale') {
        const stock = this.getFlashSaleStock(promo.id);
        if (stock) {
          flashSaleTotalStock += stock.totalStock;
          flashSaleRemainingStock += stock.totalStock - stock.soldStock - stock.lockedStock;
        }
      }
    });

    const trendData = this.buildTrendData(promotions, timeRange);

    return {
      totalOrders,
      totalSales,
      totalDiscount,
      promotionCount: promotions.length,
      flashSaleTotalStock: flashSaleTotalStock > 0 ? flashSaleTotalStock : undefined,
      flashSaleRemainingStock: flashSaleTotalStock > 0 ? flashSaleRemainingStock : undefined,
      promotionStats,
      trendData
    };
  }

  private buildTrendData(
    promotions: Promotion[],
    timeRange: { startTime?: number; endTime?: number }
  ): Array<{ timestamp: number; orderCount: number; salesAmount: number; discountAmount: number }> {
    const startTime = timeRange.startTime || Date.now() - 7 * 24 * 3600 * 1000;
    const endTime = timeRange.endTime || Date.now();

    const hourMs = 3600 * 1000;
    const points: Array<{ timestamp: number; orderCount: number; salesAmount: number; discountAmount: number }> = [];

    for (let t = startTime; t <= endTime; t += hourMs) {
      points.push({
        timestamp: t,
        orderCount: 0,
        salesAmount: 0,
        discountAmount: 0
      });
    }

    const promotionIds = new Set(promotions.map(p => p.id));

    const orders = this.getAllOrders(timeRange);
    orders.forEach(order => {
      const hasTargetPromo = order.appliedPromotions.some(p => promotionIds.has(p.promotionId));
      if (!hasTargetPromo) return;

      const point = points.find(p => p.timestamp + hourMs > order.createdAt && p.timestamp <= order.createdAt);
      if (point) {
        point.orderCount++;
        point.salesAmount += order.finalTotal;
        order.appliedPromotions.forEach(p => {
          if (promotionIds.has(p.promotionId)) {
            point.discountAmount += p.discountAmount;
          }
        });
      }
    });

    return points;
  }

  private createVersion(
    promotionId: string,
    promotion: Promotion,
    changeType: VersionChangeType,
    options?: {
      operatorId?: string;
      changeDescription?: string;
      versionStatus?: VersionStatus;
      parentVersion?: number;
    }
  ): PromotionVersion {
    const versionNum = (this.versionCounters.get(promotionId) || 0) + 1;
    this.versionCounters.set(promotionId, versionNum);

    const versionStatus = options?.versionStatus || VersionStatus.DRAFT;

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
      versionStatus,
      parentVersion: options?.parentVersion,
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

  getEffectiveVersion(promotionId: string): PromotionVersion | undefined {
    const versions = this.versions.get(promotionId) || [];
    return versions.find(v => v.versionStatus === VersionStatus.EFFECTIVE);
  }

  rollbackToVersion(
    promotionId: string,
    versionNumber: number,
    options?: { operatorId?: string }
  ): Promotion | undefined {
    const targetVersion = this.getVersion(promotionId, versionNumber);
    if (!targetVersion) return undefined;

    const promotion = this.promotions.get(promotionId);
    if (!promotion) return undefined;

    const currentEffective = this.getEffectiveVersion(promotionId);
    if (currentEffective) {
      this.markVersionStatus(promotionId, currentEffective.version, VersionStatus.HISTORICAL);
    }

    this.markVersionStatus(promotionId, targetVersion.version, VersionStatus.EFFECTIVE);

    const rolledBack: Promotion = {
      ...promotion,
      name: targetVersion.name,
      description: targetVersion.description,
      type: targetVersion.type,
      config: JSON.parse(JSON.stringify(targetVersion.config)),
      scope: JSON.parse(JSON.stringify(targetVersion.scope)),
      priority: targetVersion.priority,
      stackingMode: targetVersion.stackingMode,
      status: targetVersion.status,
      startTime: targetVersion.startTime,
      endTime: targetVersion.endTime,
      activeVersion: targetVersion.version,
      updatedAt: Date.now()
    };

    this.promotions.set(promotionId, rolledBack);

    this.createVersion(promotionId, rolledBack, VersionChangeType.ROLLBACK, {
      operatorId: options?.operatorId,
      changeDescription: `回滚到版本 v${versionNumber}`,
      versionStatus: VersionStatus.EFFECTIVE,
      parentVersion: versionNumber
    });

    return rolledBack;
  }

  private markVersionStatus(promotionId: string, versionNumber: number, status: VersionStatus): void {
    const versions = this.versions.get(promotionId) || [];
    const version = versions.find(v => v.version === versionNumber);
    if (version) {
      version.versionStatus = status;
    }
  }

  submitForApproval(
    promotionId: string,
    options?: { operatorId?: string; changeDescription?: string }
  ): Promotion | undefined {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) return undefined;

    const currentVersionNum = this.versionCounters.get(promotionId) || 0;

    const updated = { ...promotion, status: PromotionStatus.PENDING_APPROVAL, updatedAt: Date.now() };
    this.promotions.set(promotionId, updated);

    this.markVersionStatus(promotionId, currentVersionNum, VersionStatus.PENDING_APPROVAL);
    const currentVersion = this.getVersion(promotionId, currentVersionNum);
    if (currentVersion) {
      currentVersion.changeType = VersionChangeType.SUBMIT_FOR_APPROVAL;
      currentVersion.changeDescription = options?.changeDescription || '提交审批';
      if (options?.operatorId) {
        currentVersion.operatorId = options.operatorId;
      }
    }

    return updated;
  }

  approvePromotion(
    promotionId: string,
    options?: { operatorId?: string; changeDescription?: string; activate?: boolean }
  ): Promotion | undefined {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) return undefined;

    const currentVersionNum = this.versionCounters.get(promotionId) || 0;
    const currentEffective = this.getEffectiveVersion(promotionId);

    if (currentEffective) {
      this.markVersionStatus(promotionId, currentEffective.version, VersionStatus.HISTORICAL);
    }

    this.markVersionStatus(promotionId, currentVersionNum, VersionStatus.EFFECTIVE);

    const newStatus = options?.activate ? PromotionStatus.ACTIVE : PromotionStatus.INACTIVE;
    const updated = {
      ...promotion,
      status: newStatus,
      activeVersion: currentVersionNum,
      updatedAt: Date.now()
    };
    this.promotions.set(promotionId, updated);

    const currentVersion = this.getVersion(promotionId, currentVersionNum);
    if (currentVersion) {
      currentVersion.changeType = VersionChangeType.APPROVE;
      currentVersion.changeDescription = options?.changeDescription || `审批通过${options?.activate ? '并上线' : ''}`;
      if (options?.operatorId) {
        currentVersion.operatorId = options.operatorId;
      }
      currentVersion.status = newStatus;
    }

    return updated;
  }

  rejectPromotion(
    promotionId: string,
    options?: { operatorId?: string; rejectReason?: string }
  ): Promotion | undefined {
    const promotion = this.promotions.get(promotionId);
    if (!promotion) return undefined;

    const currentVersionNum = this.versionCounters.get(promotionId) || 0;

    this.markVersionStatus(promotionId, currentVersionNum, VersionStatus.REJECTED);

    const effectiveVersion = this.getEffectiveVersion(promotionId);
    let draftStatus = PromotionStatus.DRAFT;
    let draftConfig = promotion.config;
    let draftScope = promotion.scope;

    if (effectiveVersion) {
      draftStatus = effectiveVersion.status;
      draftConfig = JSON.parse(JSON.stringify(effectiveVersion.config));
      draftScope = JSON.parse(JSON.stringify(effectiveVersion.scope));
    }

    const updated = {
      ...promotion,
      status: draftStatus,
      config: draftConfig,
      scope: draftScope,
      updatedAt: Date.now()
    };

    if (effectiveVersion) {
      updated.name = effectiveVersion.name;
      updated.description = effectiveVersion.description;
      updated.type = effectiveVersion.type;
      updated.priority = effectiveVersion.priority;
      updated.stackingMode = effectiveVersion.stackingMode;
      updated.startTime = effectiveVersion.startTime;
      updated.endTime = effectiveVersion.endTime;
    }

    this.promotions.set(promotionId, updated);

    const currentVersion = this.getVersion(promotionId, currentVersionNum);
    if (currentVersion) {
      currentVersion.changeType = VersionChangeType.REJECT;
      currentVersion.changeDescription = options?.rejectReason || '审批被驳回';
      if (options?.operatorId) {
        currentVersion.operatorId = options.operatorId;
      }
    }

    return updated;
  }
}

export const dataStore = new DataStore();
