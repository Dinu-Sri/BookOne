import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listDocumentStyles, voidDocumentStyle } from '@/app/actions/document-styles';
import { getTenantInfo } from '@/app/actions/workspace';
import { ActivateStyleButton, DuplicateStyleButton } from '@/components/company/document-style-form';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';
import { kindLabel } from '@/lib/document-style';

export default async function DocumentStylesPage() {
  let tenant;
  let styles;
  try {
    [tenant, styles] = await Promise.all([getTenantInfo(), listDocumentStyles()]);
  } catch {
    redirect('/login');
  }

  return (
    <BookOneShell active="Document styles" tenant={tenant}>
      <div className="workspace" style={{ display: 'grid', gap: 16 }}>
        <Card>
          <CardHeader
            title="Document styles"
            subtitle="Logo, colour, and footer for quotes, invoices, and receipts. Use All documents for one design everywhere, or pick a brand for a brand-only look. Duplicate to start from an existing style."
            action={
              <Link href="/company/document-styles/new">
                <Button variant="primary" type="button">
                  New style
                </Button>
              </Link>
            }
          />
          <CardBody>
            {styles.length === 0 ? (
              <p className="muted-line">
                No styles yet. Prints use the BookOne default. Add a style, then Make active.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Document</th>
                      <th>Brand</th>
                      <th>Version</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {styles.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <Link href={`/company/document-styles/${s.id}`}>
                            <strong>{s.name}</strong>
                          </Link>
                        </td>
                        <td>{kindLabel(s.docKind)}</td>
                        <td>{s.brandName || 'All brands'}</td>
                        <td>v{s.version}</td>
                        <td>{s.isActive ? 'Active' : '—'}</td>
                        <td className="td-actions">
                          <div className="cluster" style={{ gap: 8 }}>
                            <ActivateStyleButton id={s.id} active={s.isActive} />
                            <DuplicateStyleButton id={s.id} />
                            <Link href={`/company/document-styles/${s.id}`}>Edit</Link>
                            <form action={voidDocumentStyle}>
                              <input type="hidden" name="id" value={s.id} />
                              <Button variant="secondary" type="submit">
                                Delete
                              </Button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </BookOneShell>
  );
}
