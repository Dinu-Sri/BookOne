import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/** Public ERP URL for "Open app" (works when docs are served on bookone-docs.* via proxy). */
function appHomeUrl(): string {
  return (
    process.env.AUTH_URL ||
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    '/'
  );
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
