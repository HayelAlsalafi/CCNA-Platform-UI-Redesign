import { expect, it, vi, beforeEach } from 'vitest';
vi.mock('@workspace/db', async () => ({ ...(await import('@workspace/db/schema')), db: {} }));
vi.mock('./question-revisions', () => ({ captureQuestionRevision: vi.fn(async () => ({})) }));
import {
  questionsTable,
  examObjectivesTable,
  questionObjectivesTable,
  examBlueprintsTable,
  examDomainsTable,
} from '@workspace/db/schema';
import { replaceQuestionAssignments, saveTaxonomy } from './taxonomy-admin';
import { captureQuestionRevision } from './question-revisions';
const q = '11111111-1111-4111-8111-111111111111',
  bp = '22222222-2222-4222-8222-222222222222',
  ob = '33333333-3333-4333-8333-333333333333',
  ob2 = '44444444-4444-4444-8444-444444444444';
function fake() {
  let mapped: unknown[] = [{ legacy: true }];
  const locks: string[] = [];
  const data = new Map<unknown, unknown[]>([
    [questionsTable, [{ id: q }]],
    [
      examObjectivesTable,
      [
        { id: ob, blueprintId: bp },
        { id: ob2, blueprintId: bp },
      ],
    ],
    [examBlueprintsTable, [{ id: bp, status: 'DRAFT', examCode: '200-301' }]],
    [examDomainsTable, []],
  ]);
  const select = () => {
    let rows: unknown[] = [];
    const c = {
      from: (table: unknown) => {
        rows = data.get(table) ?? [];
        return c;
      },
      where: () => c,
      limit: () => c,
      for: async (lock: string) => {
        locks.push(lock);
        return rows;
      },
      then: (yes: (r: unknown[]) => unknown) => Promise.resolve(rows).then(yes),
    };
    return c;
  };
  const database = {
    select,
    delete: () => ({
      where: async () => {
        mapped = [];
      },
    }),
    insert: () => ({
      values: (values: unknown[]) => {
        mapped = values;
        return {
          returning: async () => values,
          then: (yes: (r: unknown[]) => unknown) => Promise.resolve(values).then(yes),
        };
      },
    }),
    transaction: async (fn: (tx: unknown) => unknown) => {
      const old = mapped;
      try {
        return await fn(database);
      } catch (e) {
        mapped = old;
        throw e;
      }
    },
  };
  return {
    database: database as never,
    get mapped() {
      return mapped;
    },
    locks,
    data,
  };
}
beforeEach(() => vi.mocked(captureQuestionRevision).mockClear());
it('sets multiple mappings atomically under a question lock and respects revision capture', async () => {
  const f = fake();
  await replaceQuestionAssignments(
    q,
    {
      assignments: [
        { objectiveId: ob, blueprintId: bp, isPrimary: true },
        { objectiveId: ob2, blueprintId: bp, isPrimary: false },
      ],
    },
    f.database,
  );
  expect(f.mapped).toHaveLength(2);
  expect(f.locks).toEqual(['update', 'share']);
  expect(captureQuestionRevision).toHaveBeenCalledOnce();
});
it('rejects two primaries and preserves previous associations', async () => {
  const f = fake();
  await expect(
    replaceQuestionAssignments(
      q,
      {
        assignments: [ob, ob2].map((objectiveId) => ({
          objectiveId,
          blueprintId: bp,
          isPrimary: true,
        })),
      },
      f.database,
    ),
  ).rejects.toThrow();
  expect(f.mapped).toEqual([{ legacy: true }]);
});
it('rejects a cross-blueprint binding before deleting mappings', async () => {
  const f = fake();
  await expect(
    replaceQuestionAssignments(
      q,
      { assignments: [{ objectiveId: ob, blueprintId: ob2, isPrimary: false }] },
      f.database,
    ),
  ).rejects.toThrow();
  expect(f.mapped).toEqual([{ legacy: true }]);
});
it('allows explicit removal of all associations', async () => {
  const f = fake();
  await replaceQuestionAssignments(q, { assignments: [] }, f.database);
  expect(f.mapped).toEqual([]);
});
it('rejects a malformed documentation URL', async () => {
  const f = fake();
  await expect(
    saveTaxonomy(
      'blueprints',
      { examCode: '200-301', version: '1.1', title: 'CCNA', sourceUrl: 'https://#' },
      undefined,
      f.database,
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
it('requires a completed domain set before activating an existing blueprint', async () => {
  const f = fake();
  await expect(
    saveTaxonomy(
      'blueprints',
      {
        examCode: '200-301',
        version: '1.1',
        title: 'CCNA',
        status: 'ACTIVE',
        sourceUrl: 'https://example.com/docs',
        verifiedAt: '2026-10-12T00:00:00Z',
      },
      bp,
      f.database,
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
it('rejects non-string verification timestamps rather than clearing verification', async () => {
  const f = fake();
  await expect(
    saveTaxonomy(
      'blueprints',
      { examCode: '200-301', version: '1.1', title: 'CCNA', verifiedAt: false },
      undefined,
      f.database,
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
