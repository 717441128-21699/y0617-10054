import { dataStore } from '../store/dataStore';
import { FlashSaleStock } from '../types';

export interface SeckillRequest {
  requestId: string;
  userId: string;
  promotionId: string;
  productId: string;
  quantity: number;
  resolve: (result: SeckillResult) => void;
}

export interface SeckillResult {
  success: boolean;
  message: string;
  stock?: FlashSaleStock;
  orderId?: string;
}

class SeckillQueue {
  private queues: Map<string, SeckillRequest[]> = new Map();
  private processing: Map<string, boolean> = new Map();
  private userPurchaseRecords: Map<string, Map<string, number>> = new Map();

  submit(request: SeckillRequest): void {
    const { promotionId } = request;

    if (!this.queues.has(promotionId)) {
      this.queues.set(promotionId, []);
    }

    this.queues.get(promotionId)!.push(request);

    if (!this.processing.get(promotionId)) {
      this.processQueue(promotionId);
    }
  }

  private async processQueue(promotionId: string): Promise<void> {
    this.processing.set(promotionId, true);

    const queue = this.queues.get(promotionId);
    if (!queue) {
      this.processing.set(promotionId, false);
      return;
    }

    while (queue.length > 0) {
      const request = queue.shift()!;

      try {
        const result = this.processSeckillRequest(request);
        request.resolve(result);
      } catch (error) {
        request.resolve({
          success: false,
          message: error instanceof Error ? error.message : '系统错误'
        });
      }

      await this.delay(1);
    }

    this.processing.set(promotionId, false);
  }

  private processSeckillRequest(request: SeckillRequest): SeckillResult {
    const { promotionId, userId, quantity } = request;

    const promotion = dataStore.getPromotion(promotionId);
    if (!promotion) {
      return { success: false, message: '活动不存在' };
    }

    const now = Date.now();
    if (promotion.startTime > now) {
      return { success: false, message: '活动尚未开始' };
    }
    if (promotion.endTime < now) {
      return { success: false, message: '活动已结束' };
    }

    const stock = dataStore.getFlashSaleStock(promotionId);
    if (!stock) {
      return { success: false, message: '活动库存不存在' };
    }

    const availableStock = stock.totalStock - stock.soldStock - stock.lockedStock;
    if (availableStock < quantity) {
      return { success: false, message: '库存不足' };
    }

    const config = promotion.config as { limitPerUser?: number };
    if (config.limitPerUser !== undefined) {
      const userPurchased = this.getUserPurchasedQuantity(userId, promotionId);
      if (userPurchased + quantity > config.limitPerUser) {
        return {
          success: false,
          message: `每人限购${config.limitPerUser}件，您已购买${userPurchased}件`
        };
      }
    }

    const updatedStock = dataStore.updateFlashSaleStock(promotionId, {
      soldStock: stock.soldStock + quantity
    });

    this.recordUserPurchase(userId, promotionId, quantity);

    return {
      success: true,
      message: '抢购成功',
      stock: updatedStock
    };
  }

  private getUserPurchasedQuantity(userId: string, promotionId: string): number {
    const userRecord = this.userPurchaseRecords.get(userId);
    if (!userRecord) return 0;
    return userRecord.get(promotionId) || 0;
  }

  private recordUserPurchase(userId: string, promotionId: string, quantity: number): void {
    if (!this.userPurchaseRecords.has(userId)) {
      this.userPurchaseRecords.set(userId, new Map());
    }
    const userRecord = this.userPurchaseRecords.get(userId)!;
    const current = userRecord.get(promotionId) || 0;
    userRecord.set(promotionId, current + quantity);
  }

  getQueueLength(promotionId: string): number {
    const queue = this.queues.get(promotionId);
    return queue ? queue.length : 0;
  }

  getStockInfo(promotionId: string): FlashSaleStock | undefined {
    return dataStore.getFlashSaleStock(promotionId);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  resetUserPurchases(): void {
    this.userPurchaseRecords.clear();
  }
}

export const seckillQueue = new SeckillQueue();
