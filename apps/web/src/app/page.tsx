import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarDays,
  Camera,
  CheckCircle2,
  FileText,
  Landmark,
  ReceiptText,
  Upload,
} from 'lucide-react';
import { BookOneShell } from '@/components/layout/bookone-shell';
import { Badge, Button, Card, SelectLike } from '@/components/ui/bookone-ui';

const entryModes = [
  { title: 'Money In', hint: 'Received money', icon: ArrowDownLeft },
  { title: 'Money Out', hint: 'Paid or spent money', icon: ArrowUpRight, active: true },
  { title: 'Move Money', hint: 'Transfer funds', icon: ArrowRightLeft },
  { title: 'Invoice/Bill', hint: 'Pay later', icon: FileText },
];

export default function Home() {
  return (
    <BookOneShell active="Simple Entry">
      <div className="entry-screen">
        <Card className="entry-card">
          <div className="entry-card-header">
            <div>
              <p className="eyebrow">Simple entry</p>
              <h1>Record what happened</h1>
            </div>
            <Badge tone="success"><CheckCircle2 size={13} /> Ready</Badge>
          </div>

          <div className="entry-section">
            <label className="entry-label">What happened?</label>
            <div className="entry-mode-row">
              {entryModes.map((mode) => (
                <button className={`entry-mode ${mode.active ? 'active' : ''}`} type="button" key={mode.title}>
                  <mode.icon size={18} />
                  <strong>{mode.title}</strong>
                  <span>{mode.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="entry-form">
            <div className="field">
              <label>Paid to</label>
              <input className="input large" defaultValue="Meta Platforms" />
            </div>
            <div className="field">
              <label>Amount</label>
              <input className="input large" defaultValue="LKR 24,500.00" />
            </div>
            <div className="field field-full">
              <label>What was it for?</label>
              <input className="input large" defaultValue="Facebook ads campaign" />
            </div>
            <div className="field">
              <label>Paid from</label>
              <SelectLike><span className="cluster"><Landmark size={16} /> Commercial Bank</span></SelectLike>
            </div>
            <div className="field">
              <label>Date</label>
              <SelectLike><span className="cluster"><CalendarDays size={16} /> Today</span></SelectLike>
            </div>
          </div>

          <div className="entry-suggestion">
            <div>
              <span>Suggested category</span>
              <strong>Marketing expense</strong>
            </div>
            <button type="button">Change</button>
          </div>

          <div className="entry-receipt">
            <div className="cluster">
              <ReceiptText size={18} color="var(--brand)" />
              <div>
                <strong>Receipt</strong>
                <span>Optional, but useful for records.</span>
              </div>
            </div>
            <div className="cluster">
              <Button variant="secondary"><Camera size={16} /> Photo</Button>
              <Button variant="secondary"><Upload size={16} /> Upload</Button>
            </div>
          </div>

          <div className="entry-footer">
            <span>BookOne will save this as a paid expense.</span>
            <Button variant="primary">Record Money Out</Button>
          </div>
        </Card>
      </div>
    </BookOneShell>
  );
}
