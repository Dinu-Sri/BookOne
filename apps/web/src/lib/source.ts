import type { MDXContent } from 'mdx/types';
import { docs } from '../../.source';
import { createMDXSource } from 'fumadocs-mdx';
import { loader, type PageData, type Source } from 'fumadocs-core/source';
import type { TOCItemType } from 'fumadocs-core/toc';

/** Runtime fumadocs-mdx fields that default PageData does not declare. */
export type DocsPageData = PageData & {
  body: MDXContent;
  toc: TOCItemType[];
  full?: boolean;
  structuredData?: {
    headings?: { content?: string; id?: string }[];
    contents?: { content?: string; heading?: string }[];
  };
};

export function docsPageData(page: { data: PageData }): DocsPageData {
  return page.data as DocsPageData;
}

type FileEntry = {
  _file?: { path: string; absolutePath?: string };
  [key: string]: unknown;
};

/** Normalize Windows backslashes so Fumadocs page tree / slugs work. */
function fixFiles<T extends FileEntry>(entries: T[]): T[] {
  return entries.map((entry) => {
    if (!entry._file?.path) return entry;
    return {
      ...entry,
      _file: {
        ...entry._file,
        path: entry._file.path.replace(/\\/g, '/'),
        absolutePath: entry._file.absolutePath?.replace(/\\/g, '/'),
      },
    };
  });
}

const collection = docs as unknown as { docs: FileEntry[]; meta: FileEntry[] };
const docEntries = fixFiles(collection.docs ?? []);
const metaEntries = fixFiles(collection.meta ?? []);

const mdxSource = createMDXSource(docEntries as never, metaEntries as never);

// createMDXSource returns { files: () => VirtualFile[] } — normalize to array for loader.
const files =
  typeof mdxSource.files === 'function'
    ? (mdxSource.files as () => Source['files'])()
    : mdxSource.files;

export const source = loader({
  baseUrl: '/docs',
  source: { files },
});
