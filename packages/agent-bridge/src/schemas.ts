/** Single JSON Schema source for AgentBridge API and MCP tool inputs. additionalProperties is never true. */

export type JsonSchema = {
  type?: 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: false;
  enum?: Array<string | number>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  items?: JsonSchema;
  description?: string;
};

const id = { type: 'string' as const, minLength: 1, maxLength: 80 };
const hash = { type: 'string' as const, pattern: '^[a-f0-9]{64}$' };
const filename = { type: 'string' as const, minLength: 1, maxLength: 180 };
const mime = {
  type: 'string' as const,
  enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
};

export const EMPTY_OBJECT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
};

export const DOCUMENT_ID_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['documentId'],
  properties: { documentId: id },
};

export const PROPOSAL_ID_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalId'],
  properties: { proposalId: id },
};

export const OPERATION_ID_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operationId'],
  properties: { operationId: id },
};

export const SUBMIT_DOCUMENT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['filename', 'mime', 'contentBase64'],
  properties: {
    filename,
    mime,
    contentBase64: { type: 'string', minLength: 1, maxLength: 12_000_000 },
    textHint: { type: 'string', maxLength: 20_000 },
    idempotencyKey: { type: 'string', minLength: 1, maxLength: 80 },
    allowDuplicate: { type: 'boolean' },
  },
};

export const SUBMIT_FACTS_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['documentId', 'contentHash', 'expectedRevision'],
  properties: {
    documentId: id,
    contentHash: hash,
    expectedRevision: { type: 'integer', minimum: 0, maximum: 10_000 },
    idempotencyKey: { type: 'string', minLength: 1, maxLength: 80 },
    supplierName: { type: 'string', maxLength: 200 },
    supplierInvoiceNumber: { type: 'string', maxLength: 80 },
    issueDate: { type: 'string', maxLength: 32 },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    paidStatus: { type: 'string', enum: ['unpaid', 'paid', 'part_paid', 'unknown'] },
    documentKind: { type: 'string', enum: ['service_expense', 'stock', 'mixed', 'unknown'] },
    netMinor: { type: 'integer', minimum: 0 },
    taxMinor: { type: 'integer', minimum: 0 },
    grossMinor: { type: 'integer', minimum: 0 },
    expenseAccountCode: { type: 'string', maxLength: 20 },
    categoryLabel: { type: 'string', maxLength: 120 },
    lineDescription: { type: 'string', maxLength: 240 },
    invoiceKind: { type: 'string', enum: ['commercial', 'tax_invoice'] },
  },
};

export const UPDATE_DRAFT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalId', 'expectedRevision'],
  properties: {
    proposalId: id,
    expectedRevision: { type: 'integer', minimum: 1, maximum: 10_000 },
    supplierName: { type: 'string', maxLength: 200 },
    supplierInvoiceNumber: { type: 'string', maxLength: 80 },
    issueDate: { type: 'string', maxLength: 32 },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    paidStatus: { type: 'string', enum: ['unpaid', 'paid', 'part_paid', 'unknown'] },
    documentKind: { type: 'string', enum: ['service_expense', 'stock', 'mixed', 'unknown'] },
    netMinor: { type: 'integer', minimum: 0 },
    taxMinor: { type: 'integer', minimum: 0 },
    grossMinor: { type: 'integer', minimum: 0 },
    expenseAccountCode: { type: 'string', maxLength: 20 },
    categoryLabel: { type: 'string', maxLength: 120 },
    lineDescription: { type: 'string', maxLength: 240 },
  },
};

export const ANSWER_ISSUE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalId', 'issueId', 'value'],
  properties: {
    proposalId: id,
    issueId: id,
    value: { type: 'string', minLength: 1, maxLength: 400 },
  },
};

export const COMMIT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['proposalId', 'approvalId', 'idempotencyKey'],
  properties: {
    proposalId: id,
    approvalId: id,
    idempotencyKey: { type: 'string', minLength: 1, maxLength: 80 },
  },
};

export const LOOKUP_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    q: { type: 'string', maxLength: 120 },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
};

export const CREATE_UPLOAD_SESSION_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['filename', 'mime'],
  properties: {
    filename,
    mime,
    declaredBytes: { type: 'integer', minimum: 1, maximum: 8 * 1024 * 1024 },
    contentHash: hash,
    requestKey: { type: 'string', minLength: 1, maxLength: 80 },
  },
};

export const FINALIZE_UPLOAD_SESSION_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionId'],
  properties: {
    sessionId: id,
    contentBase64: { type: 'string', minLength: 1, maxLength: 12_000_000 },
    allowDuplicate: { type: 'boolean' },
  },
};

export const BATCH_MANIFEST_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 25,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['requestKey', 'filename', 'mime'],
        properties: {
          requestKey: { type: 'string', minLength: 1, maxLength: 80 },
          filename,
          mime,
          contentBase64: { type: 'string', minLength: 1, maxLength: 12_000_000 },
          contentHash: hash,
        },
      },
    },
  },
};

export const GET_BATCH_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['batchId'],
  properties: { batchId: id },
};

export const TOOL_INPUT_SCHEMAS: Record<string, JsonSchema> = {
  get_capabilities: EMPTY_OBJECT_SCHEMA,
  get_policy_context: EMPTY_OBJECT_SCHEMA,
  submit_document: SUBMIT_DOCUMENT_SCHEMA,
  submit_extracted_facts: SUBMIT_FACTS_SCHEMA,
  create_upload_session: CREATE_UPLOAD_SESSION_SCHEMA,
  finalize_upload_session: FINALIZE_UPLOAD_SESSION_SCHEMA,
  submit_batch_manifest: BATCH_MANIFEST_SCHEMA,
  get_batch_status: GET_BATCH_SCHEMA,
  lookup_suppliers: LOOKUP_SCHEMA,
  lookup_expense_accounts: LOOKUP_SCHEMA,
  list_own_proposals: LOOKUP_SCHEMA,
  get_processing_status: DOCUMENT_ID_SCHEMA,
  propose_purchase_bill: DOCUMENT_ID_SCHEMA,
  update_draft: UPDATE_DRAFT_SCHEMA,
  validate_proposal: PROPOSAL_ID_SCHEMA,
  answer_issue: ANSWER_ISSUE_SCHEMA,
  get_preview: PROPOSAL_ID_SCHEMA,
  request_approval: PROPOSAL_ID_SCHEMA,
  grant_approval: PROPOSAL_ID_SCHEMA,
  commit_approved_proposal: COMMIT_SCHEMA,
  get_operation_status: OPERATION_ID_SCHEMA,
  get_receipt: OPERATION_ID_SCHEMA,
  list_commerce_connections: EMPTY_OBJECT_SCHEMA,
  list_bookone_catalog: LOOKUP_SCHEMA,
  get_mapping_summary: {
    type: 'object',
    additionalProperties: false,
    required: ['connectionId'],
    properties: { connectionId: id },
  },
  preview_mapping_proposal: {
    type: 'object',
    additionalProperties: false,
    required: ['connectionId', 'observations'],
    properties: {
      connectionId: id,
      observations: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['externalProductId'],
          properties: {
            sku: { type: 'string', maxLength: 80 },
            name: { type: 'string', maxLength: 200 },
            externalProductId: { type: 'string', minLength: 1, maxLength: 80 },
            externalVariantId: { type: 'string', maxLength: 80 },
            origin: { type: 'string', enum: ['agent', 'verified_store'] },
          },
        },
      },
    },
  },
};

export function validateAgainstSchema(
  schema: JsonSchema,
  value: unknown,
  path = '$',
): { ok: true; value: Record<string, unknown> | unknown } | { ok: false; error: string } {
  if (schema.type === 'object') {
    if (value === undefined || value === null) {
      if ((schema.required ?? []).length === 0) return { ok: true, value: {} };
      return { ok: false, error: `${path} must be an object.` };
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: `${path} must be an object.` };
    }
    const rec = value as Record<string, unknown>;
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(rec)) {
        if (!schema.properties || !(key in schema.properties)) {
          return { ok: false, error: `${path}.${key} is not a supported field.` };
        }
      }
    }
    for (const req of schema.required ?? []) {
      if (rec[req] === undefined || rec[req] === null) {
        return { ok: false, error: `${path}.${req} is required.` };
      }
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (rec[key] === undefined) continue;
      const nested = validateAgainstSchema(child, rec[key], `${path}.${key}`);
      if (!nested.ok) return nested;
      out[key] = nested.value;
    }
    return { ok: true, value: out };
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return { ok: false, error: `${path} must be an array.` };
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      return { ok: false, error: `${path} needs at least ${schema.minItems} item(s).` };
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      return { ok: false, error: `${path} exceeds ${schema.maxItems} item(s).` };
    }
    const items: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      if (!schema.items) {
        items.push(value[i]);
        continue;
      }
      const nested = validateAgainstSchema(schema.items, value[i], `${path}[${i}]`);
      if (!nested.ok) return nested;
      items.push(nested.value);
    }
    return { ok: true, value: items };
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return { ok: false, error: `${path} must be a string.` };
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return { ok: false, error: `${path} is too short.` };
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      return { ok: false, error: `${path} is too long.` };
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      return { ok: false, error: `${path} has an invalid format.` };
    }
    if (schema.enum && !schema.enum.includes(value)) {
      return { ok: false, error: `${path} is not an allowed value.` };
    }
    return { ok: true, value };
  }
  if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, error: `${path} must be a finite number.` };
    }
    if (schema.type === 'integer' && !Number.isInteger(value)) {
      return { ok: false, error: `${path} must be an integer.` };
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      return { ok: false, error: `${path} is below the minimum.` };
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      return { ok: false, error: `${path} is above the maximum.` };
    }
    return { ok: true, value };
  }
  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') return { ok: false, error: `${path} must be a boolean.` };
    return { ok: true, value };
  }
  return { ok: true, value };
}
