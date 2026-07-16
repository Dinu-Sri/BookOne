import { redirect } from 'next/navigation';

/** Legacy combined parties page — route into the Parties module. */
export default function PartiesIndexPage() {
  redirect('/parties/customers');
}
