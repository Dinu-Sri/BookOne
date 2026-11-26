import { mergeDuplicatePartyFromForm, type PartyDuplicatePair } from '@/app/actions/parties';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/bookone-ui';

/** QA-1126-04 repair: owner-run merge of parties that posting created from a display name. */
export function PartyDuplicatesCard({ pairs, back }: { pairs: PartyDuplicatePair[]; back: string }) {
  if (pairs.length === 0) return null;
  return (
    <div className="workspace" style={{ paddingBottom: 0 }}>
      <Card>
        <CardHeader
          title="Possible duplicate parties"
          subtitle="Posting created these from a trading name. Merging moves their documents to the original party and archives the copy; posted journal amounts are not changed."
        />
        <CardBody>
          <div className="balance-list">
            {pairs.map((p) => (
              <div className="balance-row" key={p.duplicateId}>
                <span>
                  <strong>{[p.duplicateCode, p.duplicateName].filter(Boolean).join(' ')}</strong> is a copy of{' '}
                  <strong>{[p.keepCode, p.keepName].filter(Boolean).join(' ')}</strong> ({p.keepDisplayName})
                </span>
                <form action={mergeDuplicatePartyFromForm}>
                  <input type="hidden" name="duplicateId" value={p.duplicateId} />
                  <input type="hidden" name="back" value={back} />
                  <Button variant="secondary" type="submit">Merge into {p.keepCode ?? 'original'}</Button>
                </form>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
