import {
  Promotion,
  ConflictDetectionResult,
  ConflictInfo,
  PromotionScope,
  ScopeType,
  PromotionType,
  StackingMode
} from '../types';
import { dataStore } from '../store/dataStore';
import { ScopeMatcher } from '../engine/scopeMatcher';

export class ConflictDetectionService {
  detectConflicts(
    newPromotion: Partial<Promotion> & { config: any; scope: PromotionScope; startTime: number; endTime: number; type: PromotionType },
    excludePromotionId?: string
  ): ConflictDetectionResult {
    const conflicts: ConflictInfo[] = [];
    const warnings: string[] = [];

    const existingPromotions = dataStore.getAllPromotions().filter(p =>
      p.id !== excludePromotionId &&
      p.status !== 'expired'
    );

    for (const existing of existingPromotions) {
      const timeConflict = this.checkTimeConflict(newPromotion, existing);
      if (timeConflict) {
        conflicts.push(timeConflict);
      }

      if (timeConflict) {
        const scopeConflict = this.checkScopeConflict(newPromotion, existing);
        if (scopeConflict) {
          conflicts.push(scopeConflict);
        }

        const stackingConflict = this.checkStackingConflict(newPromotion, existing);
        if (stackingConflict) {
          conflicts.push(stackingConflict);
        }

        const priorityConflict = this.checkPriorityConflict(newPromotion, existing);
        if (priorityConflict) {
          conflicts.push(priorityConflict);
        }
      }
    }

    const hasConflicts = conflicts.some(c => c.level === 'error');

    if (conflicts.length === 0) {
      warnings.push('未检测到冲突，活动配置正常');
    }

    return {
      hasConflicts,
      conflicts,
      warnings
    };
  }

  private checkTimeConflict(
    newPromotion: { startTime: number; endTime: number },
    existing: Promotion
  ): ConflictInfo | null {
    const timeOverlap = !(
      newPromotion.endTime < existing.startTime ||
      newPromotion.startTime > existing.endTime
    );

    if (!timeOverlap) return null;

    const overlapStart = Math.max(newPromotion.startTime, existing.startTime);
    const overlapEnd = Math.min(newPromotion.endTime, existing.endTime);
    const overlapHours = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60));

    return {
      type: 'time',
      level: 'warning',
      description: `与活动「${existing.name}」时间重叠，重叠时长约 ${overlapHours} 小时`,
      conflictingPromotionId: existing.id,
      conflictingPromotionName: existing.name
    };
  }

  private checkScopeConflict(
    newPromotion: { scope: PromotionScope; type: PromotionType },
    existing: Promotion
  ): ConflictInfo | null {
    const affectedProducts = this.getAffectedProductCount(newPromotion.scope, existing.scope);

    if (affectedProducts === 0) return null;

    const isSameType = newPromotion.type === existing.type;
    const level = isSameType ? 'error' : 'warning';

    return {
      type: 'scope',
      level,
      description: `与活动「${existing.name}」适用范围重叠，影响约 ${affectedProducts} 个商品${isSameType ? '，同类型活动可能产生规则冲突' : ''}`,
      conflictingPromotionId: existing.id,
      conflictingPromotionName: existing.name,
      affectedProductCount: affectedProducts
    };
  }

  private checkStackingConflict(
    newPromotion: { stackingMode?: StackingMode; priority?: number; type: PromotionType },
    existing: Promotion
  ): ConflictInfo | null {
    const newStacking = newPromotion.stackingMode || 'stackable';
    const existingStacking = existing.stackingMode;

    if (newStacking === 'stackable' && existingStacking === 'stackable') {
      return null;
    }

    if (newStacking === 'mutually_exclusive' || existingStacking === 'mutually_exclusive') {
      return {
        type: 'stacking',
        level: 'warning',
        description: `与活动「${existing.name}」存在叠加策略冲突，${newStacking === 'mutually_exclusive' ? '新活动' : '现有活动'}为互斥模式，二者不可同时生效`,
        conflictingPromotionId: existing.id,
        conflictingPromotionName: existing.name
      };
    }

    return null;
  }

  private checkPriorityConflict(
    newPromotion: { priority?: number; type: PromotionType; stackingMode?: StackingMode },
    existing: Promotion
  ): ConflictInfo | null {
    const newPriority = newPromotion.priority ?? 0;

    if (newPriority !== existing.priority) return null;

    const newStacking = newPromotion.stackingMode || 'stackable';

    if (newStacking === 'stackable' && existing.stackingMode === 'stackable') {
      return {
        type: 'priority',
        level: 'warning',
        description: `与活动「${existing.name}」优先级相同 (${newPriority})，同优先级活动计算顺序可能影响最终优惠金额`,
        conflictingPromotionId: existing.id,
        conflictingPromotionName: existing.name
      };
    }

    return null;
  }

  private getAffectedProductCount(scope1: PromotionScope, scope2: PromotionScope): number {
    const allProducts = dataStore.getAllProducts();

    const productsInScope1 = allProducts.filter(p =>
      ScopeMatcher.isProductInScope(p, scope1)
    );

    const productsInBoth = productsInScope1.filter(p =>
      ScopeMatcher.isProductInScope(p, scope2)
    );

    return productsInBoth.length;
  }

  estimateDiscountImpact(
    promotion: Partial<Promotion> & { config: any; scope: PromotionScope },
    sampleProducts?: Array<{ id: string; price: number; categoryId: string }>
  ): { estimatedMaxDiscount: number; affectedProductCount: number } {
    const products = sampleProducts || dataStore.getAllProducts();
    const affectedProducts = products.filter(p =>
      ScopeMatcher.isProductInScope(p, promotion.scope)
    );

    if (affectedProducts.length === 0) {
      return { estimatedMaxDiscount: 0, affectedProductCount: 0 };
    }

    let estimatedMaxDiscount = 0;
    const sampleQuantity = 1;

    for (const product of affectedProducts.slice(0, 10)) {
      const originalPrice = product.price * sampleQuantity;

      switch (promotion.type) {
        case PromotionType.DISCOUNT: {
          const rate = promotion.config.discountRate || 1;
          const discount = originalPrice * (1 - rate);
          if (promotion.config.maxDiscountAmount) {
            estimatedMaxDiscount += Math.min(discount, promotion.config.maxDiscountAmount);
          } else {
            estimatedMaxDiscount += discount;
          }
          break;
        }
        case PromotionType.FULL_REDUCTION: {
          const threshold = promotion.config.threshold || 0;
          const discountAmount = promotion.config.discountAmount || 0;
          if (originalPrice >= threshold) {
            const times = Math.floor(originalPrice / threshold);
            const maxTimes = promotion.config.maxDiscountTimes || Infinity;
            estimatedMaxDiscount += Math.min(times, maxTimes) * discountAmount;
          }
          break;
        }
        case PromotionType.FLASH_SALE: {
          const salePrice = promotion.config.salePrice || product.price;
          estimatedMaxDiscount += (product.price - salePrice) * sampleQuantity;
          break;
        }
        case PromotionType.BUY_GIFT: {
          if (product.id === promotion.config.buyProductId) {
            estimatedMaxDiscount += 0;
          }
          break;
        }
      }
    }

    return {
      estimatedMaxDiscount,
      affectedProductCount: affectedProducts.length
    };
  }
}

export const conflictDetectionService = new ConflictDetectionService();
