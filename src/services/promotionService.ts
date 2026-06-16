import {
  Promotion,
  PromotionStatus,
  PromotionType,
  PromotionConfig,
  PromotionScope,
  StackingMode,
  SalesStats
} from '../types';
import { dataStore } from '../store/dataStore';

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

  getSalesStats(promotionId: string): SalesStats {
    return dataStore.getSalesStats(promotionId);
  }

  getAllSalesStats(): SalesStats[] {
    const promotions = dataStore.getAllPromotions();
    return promotions.map(p => dataStore.getSalesStats(p.id));
  }
}

export const promotionService = new PromotionService();
