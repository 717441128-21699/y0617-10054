export enum PromotionType {
  FULL_REDUCTION = 'full_reduction',
  DISCOUNT = 'discount',
  BUY_GIFT = 'buy_gift',
  FLASH_SALE = 'flash_sale'
}

export enum ScopeType {
  ALL = 'all',
  CATEGORY = 'category',
  PRODUCT = 'product'
}

export enum PromotionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired'
}

export enum StackingMode {
  STACKABLE = 'stackable',
  MUTUALLY_EXCLUSIVE = 'mutually_exclusive'
}

export interface PromotionScope {
  type: ScopeType;
  categoryIds?: string[];
  productIds?: string[];
}

export interface FullReductionConfig {
  threshold: number;
  discountAmount: number;
  maxDiscountTimes?: number;
}

export interface DiscountConfig {
  discountRate: number;
  maxDiscountAmount?: number;
}

export interface BuyGiftConfig {
  buyProductId: string;
  buyQuantity: number;
  giftProductId: string;
  giftQuantity: number;
  maxGiftTimes?: number;
}

export interface FlashSaleConfig {
  productId: string;
  salePrice: number;
  stock: number;
  limitPerUser?: number;
}

export type PromotionConfig = FullReductionConfig | DiscountConfig | BuyGiftConfig | FlashSaleConfig;

export interface Promotion {
  id: string;
  name: string;
  description: string;
  type: PromotionType;
  config: PromotionConfig;
  scope: PromotionScope;
  priority: number;
  stackingMode: StackingMode;
  status: PromotionStatus;
  startTime: number;
  endTime: number;
  createdAt: number;
  updatedAt: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  stock: number;
  createdAt: number;
}

export interface CartItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  product: Product;
}

export interface AppliedPromotion {
  promotionId: string;
  promotionName: string;
  type: PromotionType;
  discountAmount: number;
  giftItems?: GiftItem[];
  description: string;
}

export interface GiftItem {
  productId: string;
  productName: string;
  quantity: number;
}

export interface CalculationResult {
  originalTotal: number;
  finalTotal: number;
  totalDiscount: number;
  appliedPromotions: AppliedPromotion[];
  giftItems: GiftItem[];
  items: CartItem[];
}

export interface FlashSaleStock {
  promotionId: string;
  productId: string;
  totalStock: number;
  soldStock: number;
  lockedStock: number;
}

export interface Order {
  id: string;
  userId: string;
  items: CartItem[];
  originalTotal: number;
  finalTotal: number;
  appliedPromotions: AppliedPromotion[];
  giftItems: GiftItem[];
  status: string;
  createdAt: number;
}

export interface SalesStats {
  promotionId: string;
  orderCount: number;
  totalSales: number;
  totalDiscount: number;
  flashSaleSold?: number;
}
