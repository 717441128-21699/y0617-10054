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
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired'
}

export enum VersionChangeType {
  CREATE = 'create',
  UPDATE = 'update',
  APPROVE = 'approve',
  REJECT = 'reject',
  ROLLBACK = 'rollback',
  ACTIVATE = 'activate',
  DEACTIVATE = 'deactivate',
  SUBMIT_FOR_APPROVAL = 'submit_for_approval'
}

export enum VersionStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  EFFECTIVE = 'effective',
  HISTORICAL = 'historical',
  REJECTED = 'rejected'
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
  operatorId?: string;
  activeVersion?: number;
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

export interface PromotionVersion {
  id: string;
  promotionId: string;
  version: number;
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
  changeType: VersionChangeType;
  changeDescription?: string;
  operatorId?: string;
  versionStatus: VersionStatus;
  parentVersion?: number;
  createdAt: number;
}

export interface PromotionVersionDiff {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface ConflictInfo {
  type: 'time' | 'scope' | 'stacking' | 'priority';
  level: 'warning' | 'error';
  description: string;
  conflictingPromotionId: string;
  conflictingPromotionName: string;
  affectedProductCount?: number;
  estimatedDiscountDiff?: number;
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: ConflictInfo[];
  warnings: string[];
}

export interface BatchPreviewCartItem {
  productId: string;
  quantity: number;
}

export interface BatchPreviewRequest {
  scenarios: Array<{
    scenarioId: string;
    scenarioName?: string;
    cartItems: BatchPreviewCartItem[];
    userTags?: string[];
  }>;
  promotionToTest?: Partial<Promotion> & { config: PromotionConfig; scope: PromotionScope };
  includeExistingPromotions?: boolean;
}

export interface ScenarioPreviewResult {
  scenarioId: string;
  scenarioName?: string;
  originalTotal: number;
  finalTotal: number;
  totalDiscount: number;
  appliedPromotions: AppliedPromotion[];
  skippedPromotions: Array<{
    promotionId: string;
    promotionName: string;
    reason: string;
  }>;
  giftItems: GiftItem[];
  userTags?: string[];
  tagImpact?: {
    matchedTags: string[];
    unmatchedTags: string[];
    description: string;
  };
}

export interface DashboardFilter {
  promotionType?: PromotionType;
  categoryId?: string;
  operatorId?: string;
  startTime?: number;
  endTime?: number;
  status?: PromotionStatus[];
}

export interface PromotionEffectAnalysis {
  totalOrders: number;
  totalSales: number;
  totalDiscount: number;
  promotionCount: number;
  flashSaleRemainingStock?: number;
  flashSaleTotalStock?: number;
  promotionStats: SalesStats[];
  trendData?: Array<{
    timestamp: number;
    orderCount: number;
    salesAmount: number;
    discountAmount: number;
  }>;
}

export interface SubmitApprovalResult {
  success: boolean;
  promotion?: Promotion;
  conflictResult?: ConflictDetectionResult;
  hasBlockingConflicts?: boolean;
  warnings?: string[];
}
