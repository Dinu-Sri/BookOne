import { OPERATION_REGISTRY, SCHEMA_VERSION, type Capability } from './contracts';

export function supportedOperations() {
  return OPERATION_REGISTRY.filter((op) => op.supported);
}

export function capabilityMatrix() {
  return {
    schemaVersion: SCHEMA_VERSION,
    operations: OPERATION_REGISTRY.map((op) => ({
      id: op.id,
      title: op.title,
      write: op.write,
      supported: op.supported,
      requiredCapabilities: op.requiredCapabilities as Capability[],
      note: op.supported
        ? 'Human approval in the trusted BookOne UI is required before posting.'
        : 'Unsupported write. Use the ordinary ERP screen for this work.',
    })),
  };
}
