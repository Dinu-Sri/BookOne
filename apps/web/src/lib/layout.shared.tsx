import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <span className="font-semibold">BookOne</span>
          <span className="text-fd-muted-foreground font-normal"> Docs</span>
        </>
      ),
      url: '/docs',
    },
    links: [
      {
        text: 'Open app',
        url: '/',
        active: 'none',
      },
    ],
  };
}
