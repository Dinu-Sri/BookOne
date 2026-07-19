import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import './docs.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider
      theme={{
        enabled: true,
        defaultTheme: 'light',
        enableSystem: false,
        attribute: 'class',
        storageKey: 'bookone-docs-theme',
      }}
      search={{
        enabled: true,
        options: {
          api: '/api/search',
        },
      }}
    >
      <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
