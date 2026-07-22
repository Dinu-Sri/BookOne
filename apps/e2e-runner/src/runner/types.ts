export type Scenario = {
  id: string;
  title: string;
  section: string;
  priority: string;
  tags: string[];
  steps: string[];
};

/** Shared mutable state across serial catalog runs. */
export type RunCtx = {
  seed: string;
  brand?: string;
  location?: string;
  customer?: string;
  vendor?: string;
  product?: { name: string; sku: string; type: string };
  physicalProduct?: { name: string; sku: string };
  serviceProduct?: { name: string; sku: string };
  digitalProduct?: { name: string; sku: string };
  lastDocKind?: string;
};
