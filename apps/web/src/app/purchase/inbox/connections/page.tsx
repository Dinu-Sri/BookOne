import { redirect } from 'next/navigation';

/** Legacy connection URL. Canonical page is Company → AgentBridge. */
export default function AgentBridgeConnectionsRedirect() {
  redirect('/company/agent-bridge');
}
