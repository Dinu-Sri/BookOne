export type PreparedArchiveMeta = {
  exportId: string;
  createdAt: string;
  dataFileName: string;
  filesFileName: string;
  dataBytes: number;
  filesBytes: number;
  fileCount: number;
  missingCount: number;
  rowCounts: Record<string, number>;
  empty: boolean;
  schemaVersion: number;
};
