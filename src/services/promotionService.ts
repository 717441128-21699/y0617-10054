import {
  Promotion,
  PromotionStatus,
  PromotionType,
  PromotionConfig,
  PromotionScope,
  StackingMode,
  SalesStats,
  CalculationResult,
  CartItem,
  FlashSaleStock
} from '../types';
import { dataStore } from '../store/dataStore';
import { promotionEngine } from '../engine/promotionEngine';
import { CalculatorFactory } from '../engine/calculators';
import { FlashSaleCalculator } from '../engine/calculators/flashSale';
import { productService } from './productService';

export interface CreatePromotionParams {
  name: string;
  description: string;
  type: PromotionType;
  config: PromotionConfig;
  scope: PromotionScope;
  priority: number;
  stackingMode: StackingMode;
  startTime: number;
  endTime: number;
}

export interface WizardBasicInfo {
  name: string;
  description: string;
  type: PromotionType;
}

export interface WizardScopeConfig {
  scopeType: 'all' | 'category' | 'product';
  categoryIds?: string[];
  productIds?: string[];
}

export interface WizardStackingConfig {
  priority: number;
  stackingMode: StackingMode;
}

export interface WizardSchedule {
  startTime: number;
  endTime: number;
}

export interface WizardCreateParams {
  basicInfo: WizardBasicInfo;
  scope: WizardScopeConfig;
  config: PromotionConfig;
  stacking?: WizardStackingConfig;
  schedule: WizardSchedule;
  autoActivate?: boolean;
}

export interface StatsOverview {
  totalPromotions: number;
  activePromotions: number;
  totalOrders: number;
  totalSales: number;
  totalDiscount: number;
  flashSaleTotalStock: number;
  flashSaleSoldStock: number;
  flashSaleRemainingStock: number;
  promotionStats: SalesStats[];
}

export class PromotionService {
  createPromotion(params: CreatePromotionParams): Promotion {
    const promotion = dataStore.addPromotion({
      name: params.name,
      description: params.description,
      type: params.type,
      config: params.config,
      scope: params.scope,
      priority: params.priority,
      stackingMode: params.stackingMode,
      status: PromotionStatus.DRAFT,
      startTime: params.startTime,
      endTime: params.endTime
    });

    return promotion;
  }

  createFromWizard(params: WizardCreateParams): Promotion {
    const scope: PromotionScope = this.buildScopeFromWizard(params.scope);

    const stacking = params.stacking || {
      priority: 0,
      stackingMode: StackingMode.STACKABLE
    };

    const promotion = dataStore.addPromotion({
      name: params.basicInfo.name,
      description: params.basicInfo.description || '',
      type: params.basicInfo.type,
      config: params.config,
      scope,
      priority: stacking.priority,
      stackingMode: stacking.stackingMode,
      status: params.autoActivate ? PromotionStatus.ACTIVE : PromotionStatus.DRAFT,
      startTime: params.schedule.startTime,
      endTime: params.schedule.endTime
    });

    return promotion;
  }

  private buildScopeFromWizard(scopeConfig: WizardScopeConfig): PromotionScope {
    switch (scopeConfig.scopeType) {
      case 'all':
        return { type: 'all' as any };
      case 'category':
        return {
          type: 'category' as any,
          categoryIds: scopeConfig.categoryIds || []
        };
      case 'product':
        return {
          type: 'product' as any,
          productIds: scopeConfig.productIds || []
        };
      default:
        return { type: 'all' as any };
    }
  }

  previewPromotion(
    promotionData: Partial<Promotion> & { config: PromotionConfig; scope: PromotionScope },
    cartItemsData: Array<{ productId: string; quantity: number }>
  ): CalculationResult {
    const cartItems = productService.buildCartItems(cartItemsData);

    const tempPromotion: Promotion = {
      id: 'temp-preview',
      name: promotionData.name || '预览活动',
      description: promotionData.description || '',
      type: promotionData.type!,
      config: promotionData.config,
      scope: promotionData.scope,
      priority: promotionData.priority ?? 999,
      stackingMode: promotionData.stackingMode || StackingMode.STACKABLE,
      status: PromotionStatus.ACTIVE,
      startTime: promotionData.startTime ?? Date.now() - 86400000,
      endTime: promotionData.endTime ?? Date.now() + 86400000,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    if (tempPromotion.type === PromotionType.FLASH_SALE) {
      const flashResult = FlashSaleCalculator.calculatePreview(tempPromotion, cartItems);
      const originalTotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

      if (flashResult) {
        return {
          originalTotal,
          finalTotal: originalTotal - flashResult.discountAmount,
          totalDiscount: flashResult.discountAmount,
          appliedPromotions: [{
            promotionId: tempPromotion.id,
            promotionName: tempPromotion.name,
            type: tempPromotion.type,
            discountAmount: flashResult.discountAmount,
            giftItems: flashResult.giftItems,
            description: flashResult.description
          }],
          giftItems: flashResult.giftItems,
          items: cartItems
        };
      }
    }

    const existingPromotions = dataStore.getAllPromotions();
    const otherPromotions = existingPromotions.filter(p =>
      p.status === PromotionStatus.ACTIVE &&
      p.startTime <= Date.now() &&
      p.endTime >= Date.now()
    );

    const result = promotionEngine.calculate(cartItems);

    const calculator = CalculatorFactory.getCalculator(tempPromotion.type);
    if (calculator) {
      const promoResult = calculator.calculate(tempPromotion, cartItems, 0, []);

      if (promoResult && promoResult.discountAmount > 0) {
        if (tempPromotion.stackingMode === StackingMode.MUTUALLY_EXCLUSIVE) {
          return {
            originalTotal: result.originalTotal,
            finalTotal: result.originalTotal - promoResult.discountAmount,
            totalDiscount: promoResult.discountAmount,
            appliedPromotions: [{
              promotionId: tempPromotion.id,
              promotionName: tempPromotion.name,
              type: tempPromotion.type,
              discountAmount: promoResult.discountAmount,
              giftItems: promoResult.giftItems,
              description: promoResult.description
            }],
            giftItems: promoResult.giftItems,
            items: cartItems
          };
        } else {
          const newTotalDiscount = result.totalDiscount + promoResult.discountAmount;
          const newFinalTotal = Math.max(0, result.originalTotal - newTotalDiscount);

          return {
            originalTotal: result.originalTotal,
            finalTotal: newFinalTotal,
            totalDiscount: newTotalDiscount,
            appliedPromotions: [
              ...result.appliedPromotions,
              {
                promotionId: tempPromotion.id,
                promotionName: tempPromotion.name,
                type: tempPromotion.type,
                discountAmount: promoResult.discountAmount,
                giftItems: promoResult.giftItems,
                description: promoResult.description
              }
            ],
            giftItems: [...result.giftItems, ...promoResult.giftItems],
            items: cartItems
          };
        }
      }
    }

    return result;
  }

  getPromotion(id: string): Promotion | undefined {
    return dataStore.getPromotion(id);
  }

  getAllPromotions(status?: PromotionStatus): Promotion[] {
    const promotions = dataStore.getAllPromotions();
    if (status) {
      return promotions.filter(p => p.status === status);
    }
    return promotions;
  }

  updatePromotion(id: string, updates: Partial<Promotion>): Promotion | undefined {
    return dataStore.updatePromotion(id, updates);
  }

  deletePromotion(id: string): boolean {
    return dataStore.deletePromotion(id);
  }

  activatePromotion(id: string): Promotion | undefined {
    const promotion = dataStore.getPromotion(id);
    if (!promotion) return undefined;

    if (promotion.status === PromotionStatus.ACTIVE) return promotion;

    return dataStore.updatePromotion(id, {
      status: PromotionStatus.ACTIVE
    });
  }

  deactivatePromotion(id: string): Promotion | undefined {
    const promotion = dataStore.getPromotion(id);
    if (!promotion) return undefined;

    return dataStore.updatePromotion(id, {
      status: PromotionStatus.INACTIVE
    });
  }

  getSalesStats(promotionId: string): SalesStats & { flashSaleStock?: FlashSaleStock } {
    const stats = dataStore.getSalesStats(promotionId);
    const promotion = dataStore.getPromotion(promotionId);

    const result: any = { ...stats };

    if (promotion?.type === PromotionType.FLASH_SALE) {
      const stock = dataStore.getFlashSaleStock(promotionId);
      if (stock) {
        result.flashSaleStock = stock;
        result.flashSaleRemainingStock = stock.totalStock - stock.soldStock - stock.lockedStock;
      }
    }

    return result;
  }

  getAllSalesStats(): (SalesStats & { flashSaleStock?: FlashSaleStock })[] {
    const promotions = dataStore.getAllPromotions();
    return promotions.map(p => this.getSalesStats(p.id));
  }

  getStatsOverview(): StatsOverview {
    const promotions = dataStore.getAllPromotions();
    const activePromotions = promotions.filter(p => p.status === PromotionStatus.ACTIVE);

    let totalOrders = 0;
    let totalSales = 0;
    let totalDiscount = 0;
    let flashSaleTotalStock = 0;
    let flashSaleSoldStock = 0;

    const promotionStats: SalesStats[] = [];

    for (const promotion of promotions) {
      const stats = dataStore.getSalesStats(promotion.id);
      promotionStats.push(stats);

      totalOrders += stats.orderCount;
      totalSales += stats.totalSales;
      totalDiscount += stats.totalDiscount;

      if (promotion.type === PromotionType.FLASH_SALE) {
        const stock = dataStore.getFlashSaleStock(promotion.id);
        if (stock) {
          flashSaleTotalStock += stock.totalStock;
          flashSaleSoldStock += stock.soldStock;
        }
      }
    }

    return {
      totalPromotions: promotions.length,
      activePromotions: activePromotions.length,
      totalOrders,
      totalSales,
      totalDiscount,
      flashSaleTotalStock,
      flashSaleSoldStock,
      flashSaleRemainingStock: flashSaleTotalStock - flashSaleSoldStock,
      promotionStats
    };
  }
}

export const promotionService = new PromotionService();
