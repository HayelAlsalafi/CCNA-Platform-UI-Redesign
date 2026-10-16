import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod/v4';
import {
  db,
  examBlueprintsTable as blueprints,
  examDomainsTable as domains,
  examObjectivesTable as objectives,
  questionObjectivesTable as mappings,
  questionsTable,
} from '@workspace/db';
import {
  createExamBlueprintInputSchema,
  createExamDomainInputSchema,
  createExamObjectiveInputSchema,
  examBlueprintDomainsInputSchema,
  validateQuestionObjectiveAssignments,
} from '@workspace/db/schema';
import { captureQuestionRevision } from './question-revisions';
import { AdminContentError, parse, uuid } from './admin-content-validation';
type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
async function lockBlueprint(tx: Tx, id: string) {
  const [blueprint] = await tx
    .select()
    .from(blueprints)
    .where(eq(blueprints.id, id))
    .limit(1)
    .for('update');
  if (!blueprint) throw new AdminContentError(404, 'NOT_FOUND', 'Blueprint not found.');
  return blueprint;
}
async function validateActiveDomains(
  tx: Tx,
  blueprint: { id: string; status: string; examCode: string },
) {
  if (blueprint.status !== 'ACTIVE') return;
  const rows = await tx.select().from(domains).where(eq(domains.blueprintId, blueprint.id));
  parse(
    examBlueprintDomainsInputSchema,
    rows.map(({ id: _id, ...r }) => r),
  );
  if (
    blueprint.examCode === '200-301' &&
    rows
      .map((r) => r.code)
      .sort()
      .join(',') !== '1.0,2.0,3.0,4.0,5.0,6.0'
  )
    throw new AdminContentError(
      400,
      'VALIDATION_ERROR',
      'CCNA activation requires all six domains.',
    );
}
export async function taxonomyCatalog(database: Db = db) {
  const [blueprintRows, domainRows, objectiveRows] = await Promise.all([
    database.select().from(blueprints).orderBy(asc(blueprints.examCode), asc(blueprints.version)),
    database.select().from(domains).orderBy(asc(domains.displayOrder), asc(domains.code)),
    database.select().from(objectives).orderBy(asc(objectives.displayOrder), asc(objectives.code)),
  ]);
  return { blueprints: blueprintRows, domains: domainRows, objectives: objectiveRows };
}
export async function saveTaxonomy(
  kind: 'blueprints' | 'domains' | 'objectives',
  input: unknown,
  id?: string,
  database: Db = db,
) {
  if (id) id = parse(uuid, id);
  const body = parse(z.record(z.string(), z.unknown()), input);
  return database.transaction(async (tx) => {
    if (kind === 'blueprints') {
      const verifiedAt =
        body.verifiedAt === undefined || body.verifiedAt === null
          ? null
          : parse(z.iso.datetime({ offset: true }), body.verifiedAt);
      const data = parse(createExamBlueprintInputSchema, {
        ...body,
        verifiedAt: verifiedAt ? new Date(verifiedAt) : null,
      });
      if (id) await lockBlueprint(tx, id);
      if (data.status === 'ACTIVE') {
        if (!id)
          throw new AdminContentError(
            400,
            'VALIDATION_ERROR',
            'Create a draft and define its domains before activation.',
          );
        await validateActiveDomains(tx, { id, status: data.status, examCode: data.examCode });
      }
      const rows = id
        ? await tx.update(blueprints).set(data).where(eq(blueprints.id, id)).returning()
        : await tx.insert(blueprints).values(data).returning();
      if (!rows[0]) throw new AdminContentError(404, 'NOT_FOUND', 'Blueprint not found.');
      return rows[0];
    }
    if (kind === 'domains') {
      const data = parse(createExamDomainInputSchema, body);
      const [existing] = id
        ? await tx.select().from(domains).where(eq(domains.id, id)).limit(1).for('update')
        : [];
      if (id && !existing) throw new AdminContentError(404, 'NOT_FOUND', 'Domain not found.');
      const parentIds = [
        ...new Set([data.blueprintId, ...(existing ? [existing.blueprintId] : [])]),
      ].sort();
      const parents = [];
      for (const parentId of parentIds) parents.push(await lockBlueprint(tx, parentId));
      const rows = id
        ? await tx.update(domains).set(data).where(eq(domains.id, id)).returning()
        : await tx.insert(domains).values(data).returning();
      for (const parent of parents) await validateActiveDomains(tx, parent);
      if (!rows[0]) throw new AdminContentError(404, 'NOT_FOUND', 'Domain not found.');
      return rows[0];
    }
    const data = parse(createExamObjectiveInputSchema, body);
    const rows = id
      ? await tx.update(objectives).set(data).where(eq(objectives.id, id)).returning()
      : await tx.insert(objectives).values(data).returning();
    if (!rows[0]) throw new AdminContentError(404, 'NOT_FOUND', 'Objective not found.');
    return rows[0];
  });
}
export async function questionAssignments(id: string, database: Db = db) {
  id = parse(uuid, id);
  const [question] = await database
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(eq(questionsTable.id, id))
    .limit(1);
  if (!question) throw new AdminContentError(404, 'NOT_FOUND', 'Question not found.');
  return database
    .select()
    .from(mappings)
    .where(eq(mappings.questionId, id))
    .orderBy(asc(mappings.blueprintId), asc(mappings.objectiveId));
}
export async function replaceQuestionAssignments(id: string, input: unknown, database: Db = db) {
  id = parse(uuid, id);
  const body = parse(
    z.strictObject({
      assignments: z
        .array(z.strictObject({ objectiveId: uuid, blueprintId: uuid, isPrimary: z.boolean() }))
        .max(200),
    }),
    input,
  );
  return database.transaction(async (tx) => {
    const [question] = await tx
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.id, id))
      .limit(1)
      .for('update');
    if (!question) throw new AdminContentError(404, 'NOT_FOUND', 'Question not found.');
    const catalog = body.assignments.length
      ? await tx
          .select()
          .from(objectives)
          .where(
            inArray(
              objectives.id,
              body.assignments.map((a) => a.objectiveId),
            ),
          )
          .for('share')
      : [];
    const assignments = validateQuestionObjectiveAssignments(
      body.assignments.map((a) => ({ ...a, questionId: id })),
      catalog,
    );
    await tx.delete(mappings).where(eq(mappings.questionId, id));
    if (assignments.length) await tx.insert(mappings).values(assignments);
    await captureQuestionRevision(tx, question);
    return assignments;
  });
}
