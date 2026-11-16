import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsThemeBoundary } from '@/components/layout/docs-theme-boundary';
import { baseOptions } from '@/lib/layout.shared';
import { source } from '@/lib/source';
import './docs.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsThemeBoundary>
      <RootProvider
        theme={{
          enabled: true,
          defaultTheme: 'light',
          enableSystem: false,
          enableColorScheme: false,
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
    </DocsThemeBoundary>
  );
}
