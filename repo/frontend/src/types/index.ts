// ─── Shared ─────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string; details?: unknown };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Auth & Users ────────────────────────────────────────────────────────────

export type Role =
  | 'ADMIN'
  | 'MANAGER'
  | 'INVENTORY_CLERK'
  | 'FRONT_DESK'
  | 'HOST'
  | 'GUEST'
  | 'MODERATOR';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  phoneMasked?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

// ─── Locations ───────────────────────────────────────────────────────────────

export interface Location {
  id: number;
  name: string;
  address?: string | null;
  isActive: boolean;
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: number;
  name: string;
  sku: string;
  category: string;
  description?: string | null;
  isLotControlled: boolean;
  unitOfMeasure: string;
  unitPrice?: number | null;
  isActive: boolean;
  createdAt?: string;
}

export interface Vendor {
  id: number;
  name: string;
  contactEncrypted?: string | null;
  isActive: boolean;
}

export interface Lot {
  id: number;
  itemId: number;
  lotNumber: string;
  expirationDate?: string | null;
  item?: InventoryItem;
}

export interface StockLevel {
  id: number;
  itemId: number;
  locationId: number;
  lotId?: number | null;
  onHand: number;
  safetyThreshold: number;
  avgDailyUsage: number;
  item?: InventoryItem;
  location?: Location;
  lot?: Lot | null;
}

export type MovementType = 'RECEIVING' | 'ISSUE' | 'TRANSFER' | 'STOCK_COUNT' | 'ADJUSTMENT';

export interface LedgerEntry {
  id: number;
  itemId: number;
  lotId?: number | null;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  movementType: MovementType;
  quantity: number;
  unitCostUsd?: number | null;
  vendorId?: number | null;
  packSize?: number | null;
  deliveryDatetime?: string | null;
  referenceNumber: string;
  performedBy: number;
  approvedBy?: number | null;
  notes?: string | null;
  createdAt: string;
  item?: InventoryItem;
  fromLocation?: Location | null;
  toLocation?: Location | null;
  vendor?: Vendor | null;
  lot?: Lot | null;
  performer?: User;
}

export type StockCountStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export interface StockCountLine {
  id: number;
  stockCountId: number;
  itemId: number;
  lotId?: number | null;
  systemQty: number;
  countedQty: number;
  varianceQty: number;
  variancePct?: number | null;
  varianceUsd?: number | null;
  item?: InventoryItem;
  lot?: Lot | null;
}

export interface StockCount {
  id: number;
  locationId: number;
  initiatedBy: number;
  status: StockCountStatus;
  variancePct?: number | null;
  varianceUsd?: number | null;
  approvedBy?: number | null;
  createdAt: string;
  completedAt?: string | null;
  location?: Location;
  initiator?: User;
  lines?: StockCountLine[];
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export type ReviewStatus = 'ACTIVE' | 'FLAGGED' | 'HIDDEN' | 'REMOVED';
export type ReviewTargetType = 'STAY' | 'TASK';

export interface ReviewTag {
  id: number;
  name: string;
  category?: string | null;
}

export interface ReviewImage {
  id: number;
  reviewId: number;
  filePath: string;
  fileSize: number;
  uploadedAt: string;
}

export interface HostReply {
  id: number;
  reviewId: number;
  hostId: number;
  text: string;
  createdAt: string;
  host?: User;
}

export interface Review {
  id: number;
  reviewerId: number;
  revieweeId?: number | null;
  targetType: ReviewTargetType;
  targetId: number;
  ratingCleanliness: number;
  ratingCommunication: number;
  ratingAccuracy: number;
  overallRating: number;
  text?: string | null;
  isFollowUp: boolean;
  parentReviewId?: number | null;
  status: ReviewStatus;
  createdAt: string;
  reviewer?: User;
  reviewee?: User | null;
  images?: ReviewImage[];
  tags?: { id: number; tag: ReviewTag }[];
  hostReply?: HostReply | null;
  followUps?: Review[];
}

// ─── Trust & Credit ──────────────────────────────────────────────────────────

export interface TrustScore {
  id?: number;
  userId: number;
  score: number;
  lastUpdated?: string;
}

export interface CreditHistory {
  id: number;
  userId: number;
  changeAmount: number;
  reason: string;
  sourceType: string;
  sourceId: number;
  explanation: string;
  createdAt: string;
}

// ─── Moderation ──────────────────────────────────────────────────────────────

export type ReportStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';
export type ModerationActionType = 'WARN' | 'HIDE' | 'REMOVE' | 'RESTORE';
export type AppealStatus = 'PENDING' | 'IN_REVIEW' | 'UPHELD' | 'OVERTURNED';

export interface ModerationReport {
  id: number;
  reporterId: number;
  contentType: string;
  contentId: number;
  reviewId?: number | null;
  reason: string;
  status: ReportStatus;
  assignedTo?: number | null;
  createdAt: string;
  resolvedAt?: string | null;
  reporter?: User;
  assignee?: User | null;
}

export interface ModerationAction {
  id: number;
  reportId: number;
  moderatorId: number;
  action: ModerationActionType;
  notes?: string | null;
  createdAt: string;
  moderator?: User;
  report?: ModerationReport;
  appeals?: Appeal[];
}

export interface Appeal {
  id: number;
  userId: number;
  moderationActionId: number;
  status: AppealStatus;
  userStatement: string;
  arbitrationNotes?: string | null;
  outcome?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  user?: User;
  moderationAction?: ModerationAction;
}

export interface SensitiveWord {
  id: number;
  word: string;
  category?: string | null;
  createdAt: string;
}

// ─── Promotions ──────────────────────────────────────────────────────────────

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface Promotion {
  id: number;
  name: string;
  description?: string | null;
  discountType: DiscountType;
  discountValue: number;
  effectiveStart: string;
  effectiveEnd: string;
  priority: number;
  isActive: boolean;
  conditions?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  items?: { id: number; itemId: number; item: InventoryItem }[];
  exclusionsFrom?: { id: number; excludedPromotionId: number; excludedPromotion: { id: number; name: string } }[];
}

export interface CheckoutLine {
  itemId: number;
  quantity: number;
  unitPrice: number;
  originalTotal: number;
  discountAmount: number;
  finalTotal: number;
  promotionId: number | null;
  promotionName: string | null;
  discountExplanation: string | null;
}

export interface CheckoutResult {
  lines: CheckoutLine[];
  originalOrderTotal: number;
  totalDiscount: number;
  orderTotal: number;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchProduct {
  id: number;
  name: string;
  sku: string;
  category: string;
  description?: string | null;
  unitPrice?: number | null;
  unitOfMeasure: string;
  isLotControlled: boolean;
  productAttributes?: { id: number; attributeName: string; attributeValue: string }[];
}

export interface SuggestedTerm {
  id: number;
  term: string;
  frequency: number;
  isTrending: boolean;
  updatedAt: string;
}

// ─── Reports & KPIs ──────────────────────────────────────────────────────────

export interface KpiDaily {
  id: number;
  date: string;
  dau: number;
  conversionRate: number;
  aov: number;
  repurchaseRate: number;
  refundRate: number;
}

export interface ReviewEfficiencyReport {
  id: number;
  date: string;
  avgModerationTimeHrs: number;
  flaggedCount: number;
  resolvedCount: number;
  appealRate: number;
}

export interface ScheduledReport {
  id: number;
  reportType: string;
  requestedBy: number;
  scheduledTime: string;
  status: string;
  filePath?: string | null;
  createdAt: string;
  completedAt?: string | null;
}
