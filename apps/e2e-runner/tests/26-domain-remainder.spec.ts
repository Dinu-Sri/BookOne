import { test } from '../src/fixtures';
import { loadScenariosBySectionAndPriorities } from '../src/helpers/catalog';
import { runCatalogScenario } from '../src/helpers/catalog-run';

/**
 * Phase 4–5 remainder for domains already partially covered by deep P0 packs.
 * Explicit section string literals so coverage generator can map IDs.
 */
function registerRemainder(
  sectionLabel: string,
  scenarios: ReturnType<typeof loadScenariosBySectionAndPriorities>,
) {
  test.describe(`${sectionLabel} remainder @p1 @p2 @p3`, () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(600_000);

    for (const s of scenarios) {
      test(`${s.id} ${s.title} @${s.priority.toLowerCase()}`, async ({ page, browser }) => {
        await runCatalogScenario(page, browser, s);
      });
    }
  });
}

const prios = ['P1', 'P2', 'P3'] as const;

test.describe('Domain remainder packs Phase 4–5', () => {
  registerRemainder('Products & stock §6', loadScenariosBySectionAndPriorities('6.', [...prios]));
  registerRemainder('Sales lifecycle §8', loadScenariosBySectionAndPriorities('8.', [...prios]));
  registerRemainder('Purchase lifecycle §9', loadScenariosBySectionAndPriorities('9.', [...prios]));
  registerRemainder('POS §10', loadScenariosBySectionAndPriorities('10.', [...prios]));
  registerRemainder('Accounting §11', loadScenariosBySectionAndPriorities('11.', [...prios]));
  registerRemainder('Business-day journeys §12', loadScenariosBySectionAndPriorities('12.', [...prios]));
  registerRemainder('Security §15', loadScenariosBySectionAndPriorities('15.', [...prios]));
  registerRemainder('Integrity §19', loadScenariosBySectionAndPriorities('19.', [...prios]));
});
