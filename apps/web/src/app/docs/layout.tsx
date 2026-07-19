import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import './docs.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      search={{
        options: {
          api: '/api/search',
        },
      }}
    >
      <div className="flex min-h-screen flex-col">
        <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
          {children}
        </DocsLayout>
      </div>
    </RootProvider>
  );
}
