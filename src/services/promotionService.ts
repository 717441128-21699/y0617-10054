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
  FlashSaleStock,
  PromotionVersion,
  PromotionVersionDiff,
  ScenarioPreviewResult,
  BatchPreviewCartItem,
  AppliedPromotion,
  GiftItem
} from '../types';
import { dataStore } from '../store/dataStore';
import { promotionEngine } from '../engine/promotionEngine';
import { CalculatorFactory } from '../engine/calculators';
import { FlashSaleCalculator } from '../engine/calculators/flashSale';
import { productService } from './productService';
import { conflictDetectionService } from './conflictDetectionService';

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
  operatorId?: string;
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
  operatorId?: string;
  skipApproval?: boolean;
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
  promotionStats: (SalesStats & { flashSaleStock?: FlashSaleStock; flashSaleRemainingStock?: number; promotionName?: string; promotionType?: PromotionType })[];
}

export class PromotionService {
  createPromotion(params: CreatePromotionParams): Promotion {
    const promotion = dataStore.addPromotion(
      {
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
      },
      { operatorId: params.operatorId, changeDescription: '创建活动' }
    );

    return promotion;
  }

  createFromWizard(params: WizardCreateParams): Promotion {
    const scope: PromotionScope = this.buildScopeFromWizard(params.scope);

    const stacking = params.stacking || {
      priority: 0,
      stackingMode: StackingMode.STACKABLE
    };

    let status = PromotionStatus.DRAFT;
    if (params.autoActivate && params.skipApproval) {
      status = PromotionStatus.ACTIVE;
    } else if (params.autoActivate) {
      status = PromotionStatus.PENDING_APPROVAL;
    }

    const promotion = dataStore.addPromotion(
      {
        name: params.basicInfo.name,
        description: params.basicInfo.description || '',
        type: params.basicInfo.type,
        config: params.config,
        scope,
        priority: stacking.priority,
        stackingMode: stacking.stackingMode,
        status,
        startTime: params.schedule.startTime,
        endTime: params.schedule.endTime
      },
      {
        operatorId: params.operatorId,
        changeDescription: `通过向导创建活动${params.autoActivate ? '（提交审批）' : ''}`
      }
    );

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

  submitForApproval(promotionId: string, operatorId?: string): Promotion | undefined {
    return dataStore.submitForApproval(promotionId, { operatorId });
  }

  approvePromotion(
    promotionId: string,
    options?: { operatorId?: string; activate?: boolean; changeDescription?: string }
  ): Promotion | undefined {
    return dataStore.approvePromotion(promotionId, options);
  }

  rejectPromotion(
    promotionId: string,
    options?: { operatorId?: string; rejectReason?: string }
  ): Promotion | undefined {
    return dataStore.rejectPromotion(promotionId, options);
  }

  getVersions(promotionId: string): PromotionVersion[] {
    return dataStore.getVersions(promotionId);
  }

  getVersion(promotionId: string, versionNumber: number): PromotionVersion | undefined {
    return dataStore.getVersion(promotionId, versionNumber);
  }

  getVersionDiff(
    promotionId: string,
    version1: number,
    version2: number
  ): PromotionVersionDiff[] {
    const v1 = dataStore.getVersion(promotionId, version1);
    const v2 = dataStore.getVersion(promotionId, version2);

    if (!v1 || !v2) return [];

    const diffs: PromotionVersionDiff[] = [];
    const fields: Array<keyof PromotionVersion> = [
      'name', 'description', 'type', 'priority',
      'stackingMode', 'status', 'startTime', 'endTime'
    ];

    for (const field of fields) {
      const oldVal = JSON.stringify(v1[field]);
      const newVal = JSON.stringify(v2[field]);
      if (oldVal !== newVal) {
        diffs.push({
          field,
          oldValue: v1[field],
          newValue: v2[field]
        });
      }
    }

    const configDiff = JSON.stringify(v1.config) !== JSON.stringify(v2.config);
    if (configDiff) {
      diffs.push({
        field: 'config',
        oldValue: v1.config,
        newValue: v2.config
      });
    }

    const scopeDiff = JSON.stringify(v1.scope) !== JSON.stringify(v2.scope);
    if (scopeDiff) {
      diffs.push({
        field: 'scope',
        oldValue: v1.scope,
        newValue: v2.scope
      });
    }

    return diffs;
  }

  rollbackToVersion(
    promotionId: string,
    versionNumber: number,
    operatorId?: string
  ): Promotion | undefined {
    return dataStore.rollbackToVersion(promotionId, versionNumber, { operatorId });
  }

  detectConflicts(
    promotionData: Partial<Promotion> & { config: any; scope: PromotionScope; startTime: number; endTime: number; type: PromotionType },
    excludePromotionId?: string
  ) {
    return conflictDetectionService.detectConflicts(promotionData, excludePromotionId);
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

  batchPreview(
    scenarios: Array<{
      scenarioId: string;
      scenarioName?: string;
      cartItems: BatchPreviewCartItem[];
      userTags?: string[];
    }>,
    promotionToTest?: Partial<Promotion> & { config: PromotionConfig; scope: PromotionScope }
  ): ScenarioPreviewResult[] {
    const results: ScenarioPreviewResult[] = [];

    for (const scenario of scenarios) {
      const cartItems = productService.buildCartItems(scenario.cartItems);
      let calcResult: CalculationResult;

      if (promotionToTest) {
        calcResult = this.previewPromotion(promotionToTest, scenario.cartItems);
      } else {
        calcResult = promotionEngine.calculate(cartItems);
      }

      const allActivePromotions = dataStore.getActivePromotions();
      const skippedPromotions: Array<{
        promotionId: string;
        promotionName: string;
        reason: string;
      }> = [];

      const appliedIds = new Set(calcResult.appliedPromotions.map(p => p.promotionId));

      for (const promo of allActivePromotions) {
        if (appliedIds.has(promo.id)) continue;

        let reason = '未命中';
        const calculator = CalculatorFactory.getCalculator(promo.type);
        if (calculator) {
          const result = calculator.calculate(promo, cartItems, 0, []);
          if (!result || result.discountAmount <= 0) {
            reason = '不满足活动条件';
          } else if (promo.stackingMode === StackingMode.MUTUALLY_EXCLUSIVE) {
            reason = '互斥规则被其他活动替代';
          } else {
            reason = '优先级较低未叠加';
          }
        }

        skippedPromotions.push({
          promotionId: promo.id,
          promotionName: promo.name,
          reason
        });
      }

      if (promotionToTest && appliedIds.has('temp-preview')) {
      } else if (promotionToTest) {
        skippedPromotions.push({
          promotionId: 'temp-preview',
          promotionName: promotionToTest.name || '测试活动',
          reason: '不满足活动条件'
        });
      }

      results.push({
        scenarioId: scenario.scenarioId,
        scenarioName: scenario.scenarioName,
        originalTotal: calcResult.originalTotal,
        finalTotal: calcResult.finalTotal,
        totalDiscount: calcResult.totalDiscount,
        appliedPromotions: calcResult.appliedPromotions,
        skippedPromotions,
        giftItems: calcResult.giftItems
      });
    }

    return results;
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

  updatePromotion(
    id: string,
    updates: Partial<Promotion>,
    options?: { operatorId?: string; changeDescription?: string }
  ): Promotion | undefined {
    return dataStore.updatePromotion(id, updates, options);
  }

  deletePromotion(id: string): boolean {
    return dataStore.deletePromotion(id);
  }

  activatePromotion(id: string, operatorId?: string): Promotion | undefined {
    const promotion = dataStore.getPromotion(id);
    if (!promotion) return undefined;

    if (promotion.status === PromotionStatus.ACTIVE) return promotion;

    return dataStore.updatePromotion(id, { status: PromotionStatus.ACTIVE }, {
      operatorId,
      changeDescription: '活动上线'
    });
  }

  deactivatePromotion(id: string, operatorId?: string): Promotion | undefined {
    const promotion = dataStore.getPromotion(id);
    if (!promotion) return undefined;

    return dataStore.updatePromotion(id, { status: PromotionStatus.INACTIVE }, {
      operatorId,
      changeDescription: '活动下线'
    });
  }

  getSalesStats(
    promotionId: string,
    timeRange?: { startTime?: number; endTime?: number }
  ): SalesStats & { flashSaleStock?: FlashSaleStock; flashSaleRemainingStock?: number } {
    const stats = dataStore.getSalesStats(promotionId, timeRange);
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

  getAllSalesStats(timeRange?: { startTime?: number; endTime?: number }) {
    const promotions = dataStore.getAllPromotions();
    return promotions.map(p => {
      const stats = this.getSalesStats(p.id, timeRange);
      return {
        ...stats,
        promotionName: p.name,
        promotionType: p.type
      };
    });
  }

  getStatsOverview(timeRange?: { startTime?: number; endTime?: number }): StatsOverview {
    const promotions = dataStore.getAllPromotions();
    const activePromotions = promotions.filter(p => p.status === PromotionStatus.ACTIVE);

    let totalOrders = 0;
    let totalSales = 0;
    let totalDiscount = 0;
    let flashSaleTotalStock = 0;
    let flashSaleSoldStock = 0;

    const promotionStats: any[] = [];

    for (const promotion of promotions) {
      const stats = this.getSalesStats(promotion.id, timeRange);
      promotionStats.push({
        ...stats,
        promotionName: promotion.name,
        promotionType: promotion.type
      });

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

  exportStats(
    timeRange?: { startTime?: number; endTime?: number },
    format: 'json' | 'csv' = 'json'
  ) {
    const stats = this.getAllSalesStats(timeRange);

    if (format === 'csv') {
      const headers = ['活动ID', '活动名称', '活动类型', '订单数', '成交金额', '优惠金额', '秒杀已售', '秒杀剩余'];
      const rows = stats.map(s => [
        s.promotionId,
        (s as any).promotionName || '',
        (s as any).promotionType || '',
        s.orderCount,
        s.totalSales,
        s.totalDiscount,
        (s as any).flashSaleSold || 0,
        (s as any).flashSaleRemainingStock || 0
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      return {
        format: 'csv',
        filename: `promotion_stats_${Date.now()}.csv`,
        data: csv
      };
    }

    return {
      format: 'json',
      filename: `promotion_stats_${Date.now()}.json`,
      data: stats
    };
  }
}

export const promotionService = new PromotionService();
