import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  inwardMovementSchema,
  transferMovementSchema,
  dispatchMovementSchema,
  repackStartSchema,
  repackCompleteSchema,
  masterDataSchema,
  poLineItemSchema,
  createPOSchema,
  allocationSchema,
} from './validations';

describe('validations', () => {
  describe('loginSchema', () => {
    it('should accept valid credentials', () => {
      const result = loginSchema.safeParse({
        username: 'admin',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty username', () => {
      const result = loginSchema.safeParse({
        username: '',
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      const result = loginSchema.safeParse({
        username: 'admin',
        password: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('inwardMovementSchema', () => {
    it('should accept valid inward data', () => {
      const result = inwardMovementSchema.safeParse({
        toStore: 'Store A',
        type: 'IQF',
        variety: 'Black Tiger Shrimp',
        packing: '5 X 2 LBS',
        grade: '16/20',
        qty: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative quantity', () => {
      const result = inwardMovementSchema.safeParse({
        toStore: 'Store A',
        type: 'IQF',
        variety: 'Black Tiger Shrimp',
        packing: '5 X 2 LBS',
        grade: '16/20',
        qty: -5,
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional barcodes', () => {
      const result = inwardMovementSchema.safeParse({
        toStore: 'Store A',
        type: 'IQF',
        variety: 'Black Tiger Shrimp',
        packing: '5 X 2 LBS',
        grade: '16/20',
        qty: 2,
        barcodes: ['BC001', 'BC002'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional packingDate', () => {
      const result = inwardMovementSchema.safeParse({
        toStore: 'Store A',
        type: 'IQF',
        variety: 'Black Tiger Shrimp',
        packing: '5 X 2 LBS',
        grade: '16/20',
        qty: 10,
        packingDate: '2026-06-24',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('transferMovementSchema', () => {
    it('should accept valid transfer data', () => {
      const result = transferMovementSchema.safeParse({
        fromStore: 'Store A',
        toStore: 'Store B',
        type: 'IQF',
        variety: 'Vannamei',
        packing: '5 X 2 LBS',
        grade: '26/30',
        qty: 50,
      });
      expect(result.success).toBe(true);
    });

    it('should reject same source and destination', () => {
      const result = transferMovementSchema.safeParse({
        fromStore: 'Store A',
        toStore: 'Store A',
        type: 'IQF',
        variety: 'Vannamei',
        packing: '5 X 2 LBS',
        grade: '26/30',
        qty: 50,
      });
      expect(result.success).toBe(false);
    });

    it('should accept FIFO allocation strategy', () => {
      const result = transferMovementSchema.safeParse({
        fromStore: 'Store A',
        toStore: 'Store B',
        type: 'IQF',
        variety: 'Vannamei',
        packing: '5 X 2 LBS',
        grade: '26/30',
        qty: 50,
        allocationStrategy: 'FIFO',
      });
      expect(result.success).toBe(true);
    });

    it('should accept LIFO allocation strategy', () => {
      const result = transferMovementSchema.safeParse({
        fromStore: 'Store A',
        toStore: 'Store B',
        type: 'IQF',
        variety: 'Vannamei',
        packing: '5 X 2 LBS',
        grade: '26/30',
        qty: 50,
        allocationStrategy: 'LIFO',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid allocation strategy', () => {
      const result = transferMovementSchema.safeParse({
        fromStore: 'Store A',
        toStore: 'Store B',
        type: 'IQF',
        variety: 'Vannamei',
        packing: '5 X 2 LBS',
        grade: '26/30',
        qty: 50,
        allocationStrategy: 'RANDOM',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('dispatchMovementSchema', () => {
    it('should accept valid dispatch data', () => {
      const result = dispatchMovementSchema.safeParse({
        fromStore: 'Store A',
        toStore: 'Customer ABC',
        qty: 30,
        poId: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing poId', () => {
      const result = dispatchMovementSchema.safeParse({
        fromStore: 'Store A',
        toStore: 'Customer ABC',
        qty: 30,
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional dispatchPurpose', () => {
      const result = dispatchMovementSchema.safeParse({
        fromStore: 'Store A',
        toStore: 'Customer ABC',
        qty: 30,
        poId: 1,
        dispatchPurpose: 'SALE',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('repackStartSchema', () => {
    it('should accept valid repack start data', () => {
      const result = repackStartSchema.safeParse({
        fromStore: 'Store A',
        mcNumbers: ['MC-16-20-5X2LBS-0001', 'MC-16-20-5X2LBS-0002'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty mcNumbers', () => {
      const result = repackStartSchema.safeParse({
        fromStore: 'Store A',
        mcNumbers: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('repackCompleteSchema', () => {
    it('should accept valid repack complete data', () => {
      const result = repackCompleteSchema.safeParse({
        originalMcNumbers: ['MC-16-20-5X2LBS-0001'],
        toStore: 'Store A',
        newPacking: '10 X 1 LBS',
        items: [{ mcNumber: 'MC-16-20-10X1LBS-0001' }],
      });
      expect(result.success).toBe(true);
    });

    it('should accept GENERATE mcNumber', () => {
      const result = repackCompleteSchema.safeParse({
        originalMcNumbers: ['MC-16-20-5X2LBS-0001'],
        toStore: 'Store A',
        newPacking: '10 X 1 LBS',
        items: [{ mcNumber: 'GENERATE' }],
      });
      expect(result.success).toBe(true);
    });

    it('should accept items with barcodes', () => {
      const result = repackCompleteSchema.safeParse({
        originalMcNumbers: ['MC-16-20-5X2LBS-0001'],
        toStore: 'Store A',
        newPacking: '10 X 1 LBS',
        items: [
          { mcNumber: 'MC-16-20-10X1LBS-0001', barcode: 'CUSTOM-BC-001' },
          { mcNumber: 'MC-16-20-10X1LBS-0002', barcode: 'CUSTOM-BC-002' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('masterDataSchema', () => {
    it('should accept valid master data', () => {
      const result = masterDataSchema.safeParse({
        grade: '16/20',
        variety: 'Black Tiger',
        packing: '5 X 2 LBS',
        type: 'IQF',
        cold_store: 'Store A',
        mcs_per_fcl: 1200,
      });
      expect(result.success).toBe(true);
    });

    it('should accept partial master data', () => {
      const result = masterDataSchema.safeParse({
        grade: '16/20',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('poLineItemSchema', () => {
    it('should accept valid PO line item', () => {
      const result = poLineItemSchema.safeParse({
        type: 'IQF',
        variety: 'Black Tiger',
        grade: '16/20',
        packing: '5 X 2 LBS',
        qty: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject zero quantity', () => {
      const result = poLineItemSchema.safeParse({
        type: 'IQF',
        variety: 'Black Tiger',
        grade: '16/20',
        packing: '5 X 2 LBS',
        qty: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createPOSchema', () => {
    it('should accept valid PO with line items', () => {
      const result = createPOSchema.safeParse({
        poNumber: 'PO-001',
        orderDate: '2026-06-24',
        lineItems: [
          {
            type: 'IQF',
            variety: 'Black Tiger',
            grade: '16/20',
            packing: '5 X 2 LBS',
            qty: 100,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject PO without line items', () => {
      const result = createPOSchema.safeParse({
        poNumber: 'PO-001',
        orderDate: '2026-06-24',
        lineItems: [],
      });
      expect(result.success).toBe(false);
    });

    it('should accept branding type', () => {
      const result = createPOSchema.safeParse({
        poNumber: 'PO-001',
        orderDate: '2026-06-24',
        brandingType: 'Branded',
        loadingStore: 'Store A',
        lineItems: [
          {
            type: 'IQF',
            variety: 'Black Tiger',
            grade: '16/20',
            packing: '5 X 2 LBS',
            qty: 100,
          },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('allocationSchema', () => {
    it('should accept valid allocation', () => {
      const result = allocationSchema.safeParse({
        lineItemId: 1,
        qty: 50,
      });
      expect(result.success).toBe(true);
    });

    it('should accept allocation with cold store', () => {
      const result = allocationSchema.safeParse({
        lineItemId: 1,
        qty: 50,
        coldStore: 'Store A',
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative lineItemId', () => {
      const result = allocationSchema.safeParse({
        lineItemId: -1,
        qty: 50,
      });
      expect(result.success).toBe(false);
    });
  });
});
