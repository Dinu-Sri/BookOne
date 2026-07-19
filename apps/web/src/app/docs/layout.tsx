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
      }}
      search={{
        enabled: true,
        options: {
          api: '/api/search',
        },
      }}
    >
      <div className="flex min-h-screen flex-col bg-fd-background text-fd-foreground">
        <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
          {children}
        </DocsLayout>
      </div>
    </RootProvider>
  );
}
