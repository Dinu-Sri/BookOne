/** Plain words for Control Room statuses and audit events (UI rule book rules 2 and 5). */

type Tone = 'success' | 'warning' | 'info' | 'neutral' | 'danger';

export function companyStatusWord(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'success' };
    case 'suspended':
      return { label: 'Suspended', tone: 'danger' };
    case 'archived':
      return { label: 'Archived', tone: 'neutral' };
    default:
      return { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown', tone: 'neutral' };
  }
}

export function environmentWord(env: string | null | undefined): string {
  return env === 'staging' ? 'Test (staging)' : 'Live';
}

export function planWord(plan: string | null | undefined): string {
  if (!plan) return '—';
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

const PLATFORM_EVENTS: Record<string, string> = {
  'tenant.create': 'Company created',
  'tenant.update': 'Company details changed',
  'tenant.suspend': 'Company suspended',
  'tenant.restore': 'Company restored',
  'tenant.entity_tier': 'Company type changed',
  'tenant.modules.toggle': 'Module switched',
  'tenant.modules.reset': 'Modules reset to plan',
};

export function platformEventWord(action: string): string {
  if (PLATFORM_EVENTS[action]) return PLATFORM_EVENTS[action];
  const last = action.split('.').pop() ?? action;
  const words = last.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function shortDateTime(value: string | Date): string {
  const d = new Date(value);
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Colombo' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Colombo' });
  return `${date} ${time}`;
}
