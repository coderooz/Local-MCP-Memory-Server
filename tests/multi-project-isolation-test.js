#!/usr/bin/env node

/**
 * Multi-Project Identity Isolation Tests (WP-A)
 *
 * Replaces the legacy MongoDB-era suite that:
 *   - talked to a pre-running server on a fixed port (localhost:4000)
 *   - connected directly to a MongoDB instance
 *   - skipped every assertion when MongoDB was unavailable while still
 *     reporting the suite as PASSED
 *
 * This suite runs against the REAL active runtime (server.js) on an isolated
 * temporary database, an isolated project root and a loopback-only ephemeral
 * port (see tests/helpers/isolation-harness.js).
 *
 * Coverage:
 *   Part 0  harness self-verification (the detectors themselves are tested)
 *   Part 1  project-scoped memory reads (search)
 *   Part 2  activity log isolation
 *   Part 3  agent registry isolation
 *   Part 4  resource lock isolation
 *   Part 5  task isolation
 *
 * Every isolation assertion is paired with a positive assertion (the owning
 * project must be able to see its own record). Without that pairing a broken
 * or empty endpoint would satisfy the isolation check vacuously.
 *
 * Known production gaps (by-ID cross-project access) are NOT asserted here;
 * they are covered by tests/isolation-gap-detectors-test.js.
 */

import {
  assert,
  createHarness,
  createRunner,
  detectByIdProjectLeak,
  detectListLeak,
  detectMutationLeak,
} from './helpers/isolation-harness.js';

const runner = createRunner({ title: 'Multi-Project Isolation' });
const harness = await createHarness({ label: 'isolation' });

const ALPHA = 'wp-a-alpha';
const BETA = 'wp-a-beta';
const stamp = `${process.pid.toString(36)}${Date.now().toString(36)}`;

console.log('='.repeat(60));
console.log('🧪 Multi-Project Identity Isolation Tests (WP-A)');
console.log('='.repeat(60));
console.log(`   runtime: ${harness.baseUrl} (loopback, ephemeral)`);
console.log(`   database: ${harness.dbPath}`);
console.log(`   project identity: ${harness.identity}`);
console.log('');

// ---------------------------------------------------------------------------
// Part 0: harness self-verification
// ---------------------------------------------------------------------------

console.log('📋 PART 0: Harness Self-Verification\n');

await runner.test('by-id leak detector flags a foreign-project payload', () => {
  const leak = detectByIdProjectLeak({ context: { id: 'x', project: BETA } }, ALPHA);
  assert.ok(leak.leaked, 'A context owned by another project must be reported as a leak');
  assert.equal(leak.ownerProject, BETA, 'Detector must report the owning project');
});

await runner.test('by-id leak detector stays quiet for the owning project', () => {
  const clean = detectByIdProjectLeak({ context: { id: 'x', project: ALPHA } }, ALPHA);
  assert.ok(!clean.leaked, 'The owning project must not be reported as a leak');
});

await runner.test('mutation leak detector flags a changed field', () => {
  const leak = detectMutationLeak({ content: 'before' }, { content: 'after' });
  assert.ok(leak.mutated, 'A changed content field must be reported as a mutation');
  assert.equal(leak.field, 'content', 'Detector must name the changed field');
});

await runner.test('mutation leak detector flags a changed task title', () => {
  const leak = detectMutationLeak({ title: 'before' }, { title: 'after' });
  assert.ok(leak.mutated, 'A changed task title must be reported as a mutation');
  assert.equal(leak.field, 'title', 'Detector must name the changed title field');
});

await runner.test('mutation leak detector stays quiet for identical documents', () => {
  const clean = detectMutationLeak({ content: 'same' }, { content: 'same' });
  assert.ok(!clean.mutated, 'Identical documents must not be reported as a mutation');
});

await runner.test('list leak detector flags foreign projects only', () => {
  const leak = detectListLeak([{ project: ALPHA }, { project: BETA }], ALPHA);
  assert.ok(leak.leaked, 'A foreign project in a scoped list must be reported');
  assert.ok(
    leak.foreignProjects.every((p) => p === BETA),
    'Only foreign projects may be reported'
  );

  const clean = detectListLeak([{ project: ALPHA }], ALPHA);
  assert.ok(!clean.leaked, 'Same-project records must not be reported as a leak');
});

// ---------------------------------------------------------------------------
// Part 1: project-scoped memory reads
// ---------------------------------------------------------------------------

console.log('\n📋 PART 1: Project-Scoped Memory Reads\n');

const alphaToken = `alphatoken${stamp}`;
const betaToken = `betatoken${stamp}`;
const globalToken = `globaltoken${stamp}`;

await runner.test('project-scoped memories are created for both projects', async () => {
  const alpha = await harness.request('POST', '/context', {
    body: {
      content: `alpha secret payload ${alphaToken}`,
      project: ALPHA,
      agent: 'wp-a-alpha-agent',
      scope: 'project',
    },
  });

  assert.equal(alpha.status, 200, 'Alpha context creation must succeed');
  assert.ok(alpha.json && alpha.json.success, 'Alpha creation must report success');
  assert.equal(alpha.json.context.project, ALPHA, 'Alpha context must be stored under ALPHA');

  const beta = await harness.request('POST', '/context', {
    body: {
      content: `beta secret payload ${betaToken}`,
      project: BETA,
      agent: 'wp-a-beta-agent',
      scope: 'project',
    },
  });

  assert.equal(beta.status, 200, 'Beta context creation must succeed');
  assert.equal(beta.json.context.project, BETA, 'Beta context must be stored under BETA');

  const global = await harness.request('POST', '/context', {
    body: {
      content: `global shared payload ${globalToken}`,
      project: ALPHA,
      agent: 'wp-a-global-agent',
      scope: 'global',
    },
  });

  assert.equal(global.status, 200, 'Global context creation must succeed');
});

await runner.test('project-anchored search returns the owning project records', async () => {
  const response = await harness.request('POST', '/context/search', {
    body: { query: alphaToken, project: ALPHA, agent: 'wp-a-alpha-agent' },
  });

  assert.equal(response.status, 200, 'Anchored search must succeed');
  assert.ok(Array.isArray(response.json), 'Anchored search must return an array');

  const own = response.json.filter((entry) => entry.content.includes(alphaToken));
  assert.ok(own.length > 0, 'The owning project must be able to find its own memory');
});

await runner.test('project-anchored search never returns another project records', async () => {
  const response = await harness.request('POST', '/context/search', {
    body: { query: alphaToken, project: ALPHA, agent: 'wp-a-alpha-agent' },
  });

  const leak = detectListLeak(response.json, ALPHA, ['global']);
  assert.ok(
    !leak.leaked,
    `Anchored search leaked records owned by: ${leak.foreignProjects.join(', ')}`
  );

  const foreignContent = response.json.filter((entry) => entry.content.includes(betaToken));
  assert.equal(
    foreignContent.length,
    0,
    'Beta content must never appear in an alpha-anchored search result'
  );
});

await runner.test('reverse anchoring is symmetric', async () => {
  const response = await harness.request('POST', '/context/search', {
    body: { query: betaToken, project: BETA, agent: 'wp-a-beta-agent' },
  });

  const own = response.json.filter((entry) => entry.content.includes(betaToken));
  assert.ok(own.length > 0, 'Beta must be able to find its own memory');

  const leak = detectListLeak(response.json, BETA, ['global']);
  assert.ok(!leak.leaked, `Beta search leaked: ${leak.foreignProjects.join(', ')}`);
});

await runner.characterize(
  'global-scoped memories are visible to every project-anchored search',
  async () => {
    const response = await harness.request('POST', '/context/search', {
      body: { query: globalToken, project: BETA, agent: 'wp-a-beta-agent' },
    });

    const visible = response.json.filter((entry) => entry.content.includes(globalToken));

    return {
      observed: `scope=global entries visible to a foreign project anchor: ${visible.length}`,
      unresolved: false,
    };
  }
);

// ---------------------------------------------------------------------------
// Part 2: activity log isolation
// ---------------------------------------------------------------------------

console.log('\n📋 PART 2: Activity Log Isolation\n');

await runner.test('activity entries are isolated per project', async () => {
  await harness.request('POST', '/activity', {
    body: {
      message: `alpha activity ${alphaToken}`,
      project: ALPHA,
      agent: 'wp-a-alpha-agent',
    },
  });

  await harness.request('POST', '/activity', {
    body: {
      message: `beta activity ${betaToken}`,
      project: BETA,
      agent: 'wp-a-beta-agent',
    },
  });

  const alpha = await harness.request('GET', `/activity?project=${ALPHA}&limit=100`);
  assert.equal(alpha.status, 200, 'Activity read must succeed');
  assert.ok(Array.isArray(alpha.json), 'Activity read must return an array');

  const own = alpha.json.filter((entry) => entry.message.includes(alphaToken));
  assert.ok(own.length > 0, 'Alpha must see its own activity entries');

  const foreign = alpha.json.filter((entry) => entry.message.includes(betaToken));
  assert.equal(foreign.length, 0, 'Alpha must not see beta activity entries');

  const leak = detectListLeak(alpha.json, ALPHA, ['global', 'default']);
  assert.ok(!leak.leaked, `Activity list leaked: ${leak.foreignProjects.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Part 3: agent registry isolation
// ---------------------------------------------------------------------------

console.log('\n📋 PART 3: Agent Registry Isolation\n');

await runner.test('agent listings are isolated per project', async () => {
  // Seeded at storage level on purpose: POST /agent/register relies on
  // { upsert: true }, which the SQLite adapter does not implement, so the
  // registration route currently persists nothing (see WP-A finding N1 and
  // tests/isolation-contract-test.js). Seeding directly keeps this
  // isolation assertion meaningful instead of vacuously empty.
  const now = new Date().toISOString();

  await harness.db.collection('agents').insertOne({
    id: `agent-alpha-${stamp}`,
    agent_id: 'wp-a-alpha-agent',
    agent: 'wp-a-alpha-agent',
    project: ALPHA,
    scope: 'project',
    status: 'active',
    last_seen: now,
    createdAt: now,
    updatedAt: now,
  });

  await harness.db.collection('agents').insertOne({
    id: `agent-beta-${stamp}`,
    agent_id: 'wp-a-beta-agent',
    agent: 'wp-a-beta-agent',
    project: BETA,
    scope: 'project',
    status: 'active',
    last_seen: now,
    createdAt: now,
    updatedAt: now,
  });

  const alpha = await harness.request('GET', `/agent/list?project=${ALPHA}`);
  assert.equal(alpha.status, 200, 'Agent list must succeed');
  assert.ok(Array.isArray(alpha.json), 'Agent list must return an array');

  const own = alpha.json.filter((entry) => entry.agent_id === 'wp-a-alpha-agent');
  assert.ok(own.length > 0, 'Alpha must see its own registered agent');

  const foreign = alpha.json.filter((entry) => entry.agent_id === 'wp-a-beta-agent');
  assert.equal(foreign.length, 0, 'Alpha must not see the beta agent');

  const leak = detectListLeak(alpha.json, ALPHA);
  assert.ok(!leak.leaked, `Agent list leaked: ${leak.foreignProjects.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Part 4: resource lock isolation
// ---------------------------------------------------------------------------

console.log('\n📋 PART 4: Resource Lock Isolation\n');

const sharedResource = `wpa-shared-resource-${stamp}`;

await runner.test('the same resource name is independently lockable per project', async () => {
  const alpha = await harness.request('POST', '/lock/acquire', {
    body: {
      resource: sharedResource,
      project: ALPHA,
      agent: 'wp-a-alpha-agent',
      expiresInMs: 60000,
    },
  });

  assert.equal(alpha.status, 200, 'Alpha lock request must succeed');
  assert.equal(alpha.json.acquired, true, 'Alpha must acquire its own project-scoped lock');

  const beta = await harness.request('POST', '/lock/acquire', {
    body: {
      resource: sharedResource,
      project: BETA,
      agent: 'wp-a-beta-agent',
      expiresInMs: 60000,
    },
  });

  assert.equal(beta.status, 200, 'Beta lock request must succeed');
  assert.equal(
    beta.json.acquired,
    true,
    'A lock in another project must not block this project (project-scoped locks)'
  );
});

await runner.test('lock listings are isolated per project', async () => {
  const alpha = await harness.request('GET', `/lock/list?project=${ALPHA}`);
  assert.equal(alpha.status, 200, 'Lock list must succeed');
  assert.ok(Array.isArray(alpha.json), 'Lock list must return an array');

  const own = alpha.json.filter((lock) => lock.resource === sharedResource);
  assert.ok(own.length > 0, 'Alpha must see its own lock');

  const foreign = alpha.json.filter(
    (lock) => lock.resource === sharedResource && lock.project !== ALPHA
  );
  assert.equal(foreign.length, 0, 'Alpha must not see a lock owned by another project');

  const leak = detectListLeak(alpha.json, ALPHA);
  assert.ok(!leak.leaked, `Lock list leaked: ${leak.foreignProjects.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Part 5: task isolation
// ---------------------------------------------------------------------------

console.log('\n📋 PART 5: Task Isolation\n');

const taskTitle = `wpa-task-${stamp}`;

await runner.test('task listings are isolated per project', async () => {
  const alpha = await harness.request('POST', '/task', {
    body: {
      title: `${taskTitle} alpha`,
      project: ALPHA,
      agent: 'wp-a-alpha-agent',
      priority: 3,
    },
  });

  assert.equal(alpha.status, 200, 'Alpha task creation must succeed');
  assert.ok(alpha.json && alpha.json.success, 'Alpha task creation must report success');

  await harness.request('POST', '/task', {
    body: {
      title: `${taskTitle} beta`,
      project: BETA,
      agent: 'wp-a-beta-agent',
      priority: 3,
    },
  });

  const list = await harness.request('GET', `/task/list?project=${ALPHA}&limit=100`);
  assert.equal(list.status, 200, 'Task list must succeed');
  assert.ok(Array.isArray(list.json), 'Task list must return an array');

  const own = list.json.filter((task) => (task.title || '').includes(`${taskTitle} alpha`));
  assert.ok(own.length > 0, 'Alpha must see its own task');

  const foreign = list.json.filter((task) => (task.title || '').includes(`${taskTitle} beta`));
  assert.equal(foreign.length, 0, 'Alpha must not see the beta task');

  const leak = detectListLeak(list.json, ALPHA);
  assert.ok(!leak.leaked, `Task list leaked: ${leak.foreignProjects.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Teardown evidence
// ---------------------------------------------------------------------------

const teardown = await harness.close();

console.log('\n📋 PART 6: Teardown Evidence\n');

await runner.test('the harness released every resource it created', () => {
  assert.ok(teardown.listenerClosed, 'The HTTP listener must be closed');
  assert.ok(teardown.portReleased, 'The ephemeral port must be released');
  assert.ok(teardown.databaseClosed, 'The database connection must be closed');
  assert.ok(teardown.tempRootRemoved, 'The temporary root must be removed');
  assert.ok(teardown.dbFileRemoved, 'The temporary database file must be removed');
  assert.ok(teardown.projectRootRemoved, 'The temporary project root must be removed');
});

await runner.test('the harness stayed inside its request budget', () => {
  assert.ok(
    teardown.requestsIssued <= 100,
    `The suite issued ${teardown.requestsIssued} requests (budget 100)`
  );
});

process.exit(runner.finish());
