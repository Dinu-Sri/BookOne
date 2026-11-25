import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/**
 * "Open app" from /docs. The docs here are served by the same app on every
 * host, so a relative link keeps the user on the host (and session) they are
 * on. The static docs site (apps/docs) builds its own absolute app link.
 */
function appHomeUrl(): string {
  return '/';
}

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
        url: appHomeUrl(),
        active: 'none',
      },
    ],
  };
}
