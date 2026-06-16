import { redirect } from 'next/navigation';
import { getTenantInfo } from '@/app/actions/workspace';
import { auth } from '@bookone/auth';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Card, PageHeading } from '@/components/ui/bookone-ui';
import { signOut } from '@bookone/auth';
import { Building2, LogOut, UserCircle2 } from 'lucide-react';

export default async function SettingsPage() {
  let tenant;
  let session;
  try {
    [tenant, session] = await Promise.all([getTenantInfo(), auth()]);
  } catch (err) {
    redirect('/login');
  }

  const user = session?.user;
  const planLabel: Record<string, string> = {
    starter: 'Starter (free)',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };

  return (
    <BookOneShell active="Settings" tenant={tenant}>
      <div className="workspace">
        <PageHeading
          eyebrow="Workspace"
          title="Settings"
          lead="Tenant and user information. Multi-user invitations and billing are coming in a later release."
        />

        <div className="grid two">
          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">Tenant</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>{tenant.name}</h2>
              </div>
              <Building2 size={18} color="var(--brand)" />
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gap: 12 }}>
                <Row label="Slug" value={<code>{tenant.slug}</code>} />
                <Row label="Plan" value={<Badge tone="info">{planLabel[tenant.plan] ?? tenant.plan}</Badge>} />
                <Row label="Tenant ID" value={<code style={{ fontSize: 11 }}>{tenant.id}</code>} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="card-header">
              <div>
                <p className="eyebrow">You</p>
                <h2 className="card-title" style={{ marginTop: 4 }}>{user?.name ?? user?.email}</h2>
              </div>
              <UserCircle2 size={18} color="var(--brand)" />
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gap: 12 }}>
                <Row label="Email" value={user?.email ?? '—'} />
                <Row label="Role" value={<Badge tone="success">{user?.role ?? 'member'}</Badge>} />
                <Row label="User ID" value={<code style={{ fontSize: 11 }}>{user?.id ?? '—'}</code>} />
              </div>
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/login' });
                }}
                style={{ marginTop: 18 }}
              >
                <button type="submit" className="button secondary" style={{ width: '100%', justifyContent: 'center' }}>
                  <LogOut size={16} /> Sign out
                </button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </BookOneShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="balance-row" style={{ padding: '10px 0', border: 'none', background: 'transparent' }}>
      <span style={{ color: 'var(--ink-muted)', fontSize: 12, fontWeight: 750 }}>{label}</span>
      <strong style={{ fontSize: 13 }}>{value}</strong>
    </div>
  );
}
