import { z } from 'zod';

// Login validation
export const loginSchema = z.object({
    username: z.string().min(1, 'Username is required'), // Changed from email
    password: z.string().min(1, 'Password is required'),
});

// Inward movement validation
export const inwardMovementSchema = z.object({
    toStore: z.string().min(1, 'To Store is required'),
    type: z.string().min(1, 'Type is required'),
    variety: z.string().min(1, 'Variety is required'),
    packing: z.string().min(1, 'Packing is required'),
    grade: z.string().min(1, 'Grade is required'),
    qty: z.number().int().positive('Quantity must be a positive number'),
    remarks: z.string().nullish(),
    barcodes: z.array(z.string()).optional(),
});

// Transfer movement validation
export const transferMovementSchema = z.object({
    fromStore: z.string().min(1, 'From Store is required'),
    toStore: z.string().min(1, 'To Store is required'),
    type: z.string().min(1, 'Type is required'),
    variety: z.string().min(1, 'Variety is required'),
    packing: z.string().min(1, 'Packing is required'),
    grade: z.string().min(1, 'Grade is required'),
    qty: z.number().int().positive('Quantity must be a positive number'),
    remarks: z.string().nullish(),
}).refine(data => data.fromStore !== data.toStore, {
    message: 'From Store and To Store must be different',
    path: ['toStore'],
});

// Dispatch movement validation (Store to Client/Exit)
export const dispatchMovementSchema = z.object({
    fromStore: z.string().min(1, 'From Store is required'),
    toStore: z.string().min(1, 'Client/Destination is required'), // Client Name or "Repacking"
    type: z.string().min(1, 'Type is required'),
    variety: z.string().min(1, 'Variety is required'),
    packing: z.string().min(1, 'Packing is required'),
    grade: z.string().min(1, 'Grade is required'),
    qty: z.number().int().positive('Quantity must be a positive number'),
    remarks: z.string().nullish(),
    dispatchPurpose: z.enum(['SALE', 'REPACKING']).nullish(), // New field
    poId: z.number().nullish(), // Linked PO ID (for Sale)
});

// Repacking Start validation
export const repackStartSchema = z.object({
    fromStore: z.string().min(1, 'From Store is required'),
    mcNumbers: z.array(z.string()).min(1, 'At least one MC must be selected'),
    remarks: z.string().nullish(),
});

// Repacking Complete validation
export const repackCompleteSchema = z.object({
    originalMcNumbers: z.array(z.string()).min(1, 'Original MC numbers required'),
    toStore: z.string().min(1, 'To Store is required'),
    newPacking: z.string().min(1, 'New Packing label is required'),
    items: z.array(z.object({
        mcNumber: z.string().min(1, 'New MC number required'),
        barcode: z.string().nullish(),
    })).min(1, 'At least one new MC must be created'),
    remarks: z.string().nullish(),
});

// Master data validation
export const masterDataSchema = z.object({
    grade: z.string().optional(),
    variety: z.string().optional(),
    packing: z.string().optional(),
    type: z.string().optional(),
    cold_store: z.string().optional(),
    mcs_per_fcl: z.number().int().positive().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type InwardMovementInput = z.infer<typeof inwardMovementSchema>;
export type TransferMovementInput = z.infer<typeof transferMovementSchema>;
export type DispatchMovementInput = z.infer<typeof dispatchMovementSchema>;
export type MasterDataInput = z.infer<typeof masterDataSchema>;

// PO Line Item validation
export const poLineItemSchema = z.object({
    type: z.string().min(1, 'Type is required'),
    variety: z.string().min(1, 'Variety is required'),
    grade: z.string().min(1, 'Grade is required'),
    packing: z.string().min(1, 'Packing is required'),
    qty: z.number().int().positive('Quantity must be a positive number'),
});

// Create PO validation
export const createPOSchema = z.object({
    poNumber: z.string().min(1, 'PO Number is required'),
    orderDate: z.string().min(1, 'Order Date is required'),
    lineItems: z.array(poLineItemSchema).min(1, 'At least one line item is required'),
});

// Allocation validation
export const allocationSchema = z.object({
    lineItemId: z.number().int().positive('Line Item ID is required'),
    qty: z.number().int().positive('Quantity must be a positive number'),
    coldStore: z.string().optional(),
});

export type POLineItemInput = z.infer<typeof poLineItemSchema>;
export type CreatePOInput = z.infer<typeof createPOSchema>;
export type AllocationInput = z.infer<typeof allocationSchema>;
export type RepackStartInput = z.infer<typeof repackStartSchema>;
export type RepackCompleteInput = z.infer<typeof repackCompleteSchema>;

