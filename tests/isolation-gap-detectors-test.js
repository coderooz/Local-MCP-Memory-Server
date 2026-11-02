#!/usr/bin/env node

/**
 * Isolation Gap Detectors (WP-A)
 *
 * These are NOT "green" suites. Each case asserts the DESIRED invariant from
 * the audit report and therefore FAILS while the corresponding production gap
 * is still open. They are the preserved regression tests for the audit
 * findings and are expected to flip green when WP-B lands.
 *
 *   G1  F-03 / INV-02  a by-id read must not return another project's memory
 *   G2  F-03 / INV-02  a by-id update must not modify another project's memory
 *   G3  F-03 / INV-02  a by-id update must not modify another project's task
 *   G4  F-03 / INV-01  a trusted project header must scope a by-id read
 *   G5  INV-20         a session-bound memory must not be returned to a
 *                      different session
 *   G6  INV-20         a created session must resolve on the live path
 *   G7  INV-20         a session-bound memory must not be written by another session
 *   G8  INV-02         agent registration must be an idempotent upsert
 *   G9  INV-02         project-map writes must be an idempotent upsert
 *   G10 F-03 / INV-02  connected-context expansion must stay inside the project
 *
 * Exit code: 1 while any gap is open, 0 once every detector passes.
 * CI runs this suite as the WP-B regression gate.
 */

import {
  assert,
  createHarness,
  createRunner,
  detectByIdProjectLeak,
  detectMutationLeak,
} from './helpers/isolation-harness.js';

const runner = createRunner({ title: 'Isolation Gap Detectors' });
const harness = await createHarness({ label: 'gap' });

const ALPHA = 'wp-a-gap-alpha';
const BETA = 'wp-a-gap-beta';
const stamp = `${process.pid.toString(36)}${Date.now().toString(36)}`;

console.log('='.repeat(60));
console.log('🚨 Isolation Gap Detectors (WP-A) - expected to fail until WP-B');
console.log('='.repeat(60));
console.log(`   runtime: ${harness.baseUrl} (loopback, ephemeral)`);
console.log('');

// ---------------------------------------------------------------------------
// G1: by-id read must not cross project boundaries
// ---------------------------------------------------------------------------

await runner.gap(
  'F-03/INV-02: GET /context/:id/full must not return a foreign memory',
  async () => {
    const created = await harness.request('POST', '/context', {
      body: {
        content: `gap alpha secret ${stamp}`,
        project: ALPHA,
        agent: 'wp-a-gap-alpha-agent',
        scope: 'project',
      },
    });

    assert.equal(created.status, 200, 'Fixture creation must succeed');
    const alphaId = created.json.context.id;

    const read = await harness.request('GET', `/context/${alphaId}/full?project=${BETA}`);

    const leak = detectByIdProjectLeak(read.json, BETA);

    assert.ok(
      !leak.leaked,
      'F-03 violated: the by-id read returned a memory owned by project ' +
        `"${leak.ownerProject}" to a caller scoped to "${BETA}" ` +
        '(server.js GET /context/:id/full filters by id only)'
    );
  }
);

// ---------------------------------------------------------------------------
// G2: by-id update must not cross project boundaries
// ---------------------------------------------------------------------------

await runner.gap('F-03/INV-02: POST /context/update must not modify a foreign memory', async () => {
  const created = await harness.request('POST', '/context', {
    body: {
      content: `gap alpha protected ${stamp}`,
      project: ALPHA,
      agent: 'wp-a-gap-alpha-agent',
      scope: 'project',
    },
  });

  const alphaId = created.json.context.id;
  const before = (await harness.readCollection('contexts', { id: alphaId }))[0];

  const update = await harness.request('POST', '/context/update', {
    body: {
      context_id: alphaId,
      updates: { content: `gap beta overwrite ${stamp}` },
      project: BETA,
      agent: 'wp-a-gap-beta-agent',
    },
  });

  const after = (await harness.readCollection('contexts', { id: alphaId }))[0];
  const mutation = detectMutationLeak(before, after);

  assert.ok(
    !mutation.mutated,
    `F-03 violated: a caller scoped to "${BETA}" modified the "${ALPHA}" memory ` +
      `(field "${mutation.field}"); the update route filters by id only ` +
      '(server.js POST /context/update)'
  );

  assert.ok(
    update.json.success !== true || update.json.error,
    'A refused cross-project update must not report success'
  );
});

// ---------------------------------------------------------------------------
// G3: task updates must not cross project boundaries
// ---------------------------------------------------------------------------

await runner.gap('F-03/INV-02: POST /task/update must not modify a foreign task', async () => {
  const created = await harness.request('POST', '/task', {
    body: {
      title: `gap alpha task ${stamp}`,
      project: ALPHA,
      agent: 'wp-a-gap-alpha-agent',
      priority: 3,
    },
  });

  const taskId = created.json.task.task_id;
  const before = (await harness.readCollection('tasks', { task_id: taskId }))[0];

  await harness.request('POST', '/task/update', {
    body: {
      task_id: taskId,
      updates: { title: `gap beta task ${stamp}` },
      project: BETA,
      agent: 'wp-a-gap-beta-agent',
    },
  });

  const after = (await harness.readCollection('tasks', { task_id: taskId }))[0];
  const mutation = detectMutationLeak(before, after);

  assert.ok(
    !mutation.mutated,
    `F-03 violated: a caller scoped to "${BETA}" modified the "${ALPHA}" task ` +
      `(field "${mutation.field}"); the update route filters by task_id only ` +
      '(server.js POST /task/update)'
  );
});

// ---------------------------------------------------------------------------
// G4: the trusted project header must scope a by-id read
// ---------------------------------------------------------------------------

await runner.gap('F-03/INV-01: a trusted project header must scope a by-id read', async () => {
  const created = await harness.request('POST', '/context', {
    body: {
      content: `gap header protected ${stamp}`,
      project: ALPHA,
      agent: 'wp-a-gap-alpha-agent',
      scope: 'project',
    },
  });

  const alphaId = created.json.context.id;

  const read = await harness.request('GET', `/context/${alphaId}/full`, {
    headers: { 'x-mcp-project': BETA },
  });

  const leak = detectByIdProjectLeak(read.json, BETA);

  assert.ok(
    !leak.leaked,
    `F-03/INV-01 violated: presenting the trusted header x-mcp-project: ${BETA} still ` +
      `returned a memory owned by "${leak.ownerProject}"; the request-scoped project is ` +
      'not applied to by-id reads'
  );
});

// ---------------------------------------------------------------------------
// G5: session-bound memories must not leak across sessions
// ---------------------------------------------------------------------------

await runner.gap(
  'INV-20: a session-bound memory must not be returned to another session',
  async () => {
    const ownerSession = `wp-a-session-owner-${stamp}`;
    const otherSession = `wp-a-session-other-${stamp}`;

    const created = await harness.request('POST', '/context', {
      body: {
        content: `gap session protected ${stamp}`,
        project: ALPHA,
        agent: 'wp-a-gap-alpha-agent',
        scope: 'project',
        sessionId: ownerSession,
      },
    });

    const alphaId = created.json.context.id;

    const read = await harness.request('GET', `/context/${alphaId}/full`, {
      headers: { 'x-mcp-session-id': otherSession },
    });

    assert.ok(
      !read.json.context,
      `INV-20 violated: a memory bound to session "${ownerSession}" was returned to a ` +
        `caller presenting session "${otherSession}" (server.js GET /context/:id/full applies ` +
        'no session filter)'
    );
  }
);

// ---------------------------------------------------------------------------
// G6: the created session must resolve on the live request path
// ---------------------------------------------------------------------------

await runner.gap('INV-20: a session created via POST /session must resolve live', async () => {
  const sessionId = `wp-a-gap-session-${stamp}`;

  const created = await harness.request('POST', '/session', {
    headers: { 'x-mcp-project': ALPHA },
    body: { sessionId, agent: 'wp-a-gap-alpha-agent', project: ALPHA },
  });

  assert.equal(created.status, 200, 'Session creation must succeed');
  assert.equal(created.json.session.sessionId, sessionId, 'Creation must answer for the session');

  const current = await harness.request('GET', '/session/current', {
    headers: { 'x-mcp-session-id': sessionId },
  });
  assert.ok(
    current.json.session,
    'INV-20 violated: GET /session/current cannot resolve the session POST /session created'
  );
  assert.equal(
    current.json.session.sessionId,
    sessionId,
    'INV-20 violated: the resolved session is not the created session'
  );

  const heartbeat = await harness.request('POST', '/session/heartbeat', {
    headers: { 'x-mcp-session-id': sessionId },
    body: {},
  });
  assert.equal(
    heartbeat.json.success,
    true,
    'INV-20 violated: a live session cannot accept a heartbeat'
  );

  const stored = await harness.readCollection('sessions', { sessionId });
  assert.equal(stored.length, 1, 'The session must be persisted exactly once');
});

// ---------------------------------------------------------------------------
// G7: a session-bound memory must not be written by another session
// ---------------------------------------------------------------------------

await runner.gap(
  'INV-20: a session-bound memory must not be modified by another session',
  async () => {
    const ownerSession = `wp-a-gap-write-owner-${stamp}`;
    const otherSession = `wp-a-gap-write-other-${stamp}`;

    const created = await harness.request('POST', '/context', {
      body: {
        content: `gap session write protected ${stamp}`,
        project: ALPHA,
        agent: 'wp-a-gap-alpha-agent',
        scope: 'project',
        sessionId: ownerSession,
      },
    });

    const contextId = created.json.context.id;
    const before = (await harness.readCollection('contexts', { id: contextId }))[0];

    const update = await harness.request('POST', '/context/update', {
      headers: { 'x-mcp-session-id': otherSession },
      body: {
        context_id: contextId,
        updates: { content: `gap session write overwrite ${stamp}` },
        agent: 'wp-a-gap-beta-agent',
      },
    });

    const after = (await harness.readCollection('contexts', { id: contextId }))[0];
    const mutation = detectMutationLeak(before, after);

    assert.ok(
      !mutation.mutated,
      `INV-20 violated: session "${otherSession}" modified a memory bound to "${ownerSession}" ` +
        `(field "${mutation.field}")`
    );
    assert.ok(
      update.json.success !== true || update.json.error,
      'A refused cross-session write must not report success'
    );
  }
);

// ---------------------------------------------------------------------------
// G8: agent registration is an idempotent upsert
// ---------------------------------------------------------------------------

await runner.gap('INV-02: agent registration must be an idempotent upsert', async () => {
  const agentId = `wp-a-gap-agent-${stamp}`;

  const first = await harness.request('POST', '/agent/register', {
    body: { agent_id: agentId, project: ALPHA, name: 'Gap Agent', status: 'active' },
  });
  assert.equal(first.status, 200, 'Registration must succeed');

  const second = await harness.request('POST', '/agent/register', {
    body: { agent_id: agentId, project: ALPHA, name: 'Gap Agent Renamed', status: 'idle' },
  });
  assert.equal(second.status, 200, 'A repeated registration must succeed');

  const stored = await harness.readCollection('agents', { agent_id: agentId });
  assert.equal(stored.length, 1, 'Repeated registration must not duplicate the agent row');
  assert.equal(stored[0].name, 'Gap Agent Renamed', 'Repeated registration must refresh the row');
});

// ---------------------------------------------------------------------------
// G9: project-map writes are an idempotent upsert
// ---------------------------------------------------------------------------

await runner.gap('INV-02: project-map writes must be an idempotent upsert', async () => {
  const filePath = `src/wpb-gap-${stamp}.js`;

  const first = await harness.request('POST', '/project-map', {
    body: {
      file_path: filePath,
      project: ALPHA,
      agent: 'wp-a-gap-alpha-agent',
      summary: 'first summary',
    },
  });
  assert.equal(first.status, 200, 'The first project-map write must succeed');

  const second = await harness.request('POST', '/project-map', {
    body: {
      file_path: filePath,
      project: ALPHA,
      agent: 'wp-a-gap-alpha-agent',
      summary: 'second summary',
    },
  });
  assert.equal(second.status, 200, 'A repeated project-map write must succeed');

  const stored = await harness.readCollection('project_map', {
    project: ALPHA,
    file_path: filePath,
  });
  assert.equal(stored.length, 1, 'Project-map writes must not duplicate the path entry');
  assert.equal(stored[0].summary, 'second summary', 'A repeated write must refresh the entry');
});

// ---------------------------------------------------------------------------
// G10: connected-context expansion stays inside the project
// ---------------------------------------------------------------------------

await runner.gap('F-03/INV-02: connected-context expansion must stay in-project', async () => {
  const created = await harness.request('POST', '/context', {
    body: {
      content: `gap connected protected ${stamp}`,
      project: ALPHA,
      agent: 'wp-a-gap-alpha-agent',
      scope: 'project',
    },
  });

  const contextId = created.json.context.id;

  const foreign = await harness.request('GET', `/context/${contextId}/connected?project=${BETA}`);
  assert.ok(
    !foreign.json.context,
    `F-03 violated: /context/:id/connected returned a "${ALPHA}" record to a "${BETA}" caller`
  );

  const own = await harness.request('GET', `/context/${contextId}/connected?project=${ALPHA}`);
  assert.equal(
    own.json.context.id,
    contextId,
    'The owning project must still read its own context'
  );
});

// ---------------------------------------------------------------------------
// Adapter contract: { upsert: true } inserts once, then updates; omitted/false
// never inserts. Verified below the HTTP layer with SQLite state.
// ---------------------------------------------------------------------------

await runner.test('the SQLite adapter honors the { upsert: true } contract', async () => {
  const agents = harness.db.collection('agents');
  const agentId = `wp-b-adapter-${stamp}`;
  const now = new Date().toISOString();
  const base = {
    agent_id: agentId,
    agent: agentId,
    project: ALPHA,
    scope: 'project',
    status: 'active',
    last_seen: now,
  };

  const inserted = await agents.updateOne(
    { agent_id: agentId },
    { $set: { ...base, name: 'Upsert One' } },
    { upsert: true }
  );

  assert.equal(inserted.upsertedCount, 1, 'A missing row must be inserted on upsert');
  assert.ok(inserted.upsertedId, 'The insert must report the new row id');

  const updated = await agents.updateOne(
    { agent_id: agentId },
    { $set: { name: 'Upsert Two' } },
    { upsert: true }
  );

  assert.equal(updated.upsertedCount ?? 0, 0, 'An existing row must not be re-inserted');
  assert.equal(updated.matchedCount, 1, 'The existing row must be matched');

  const rows = await harness.readCollection('agents', { agent_id: agentId });
  assert.equal(rows.length, 1, 'Upsert must not duplicate the row');
  assert.equal(rows[0].name, 'Upsert Two', 'Upsert must refresh the existing row');

  const absentId = `wp-b-no-upsert-${stamp}`;
  const skipped = await agents.updateOne(
    { agent_id: absentId },
    { $set: { ...base, agent_id: absentId, name: 'Never Inserted' } },
    {}
  );
  const skippedFalse = await agents.updateOne(
    { agent_id: absentId },
    { $set: { ...base, agent_id: absentId, name: 'Never Inserted' } },
    { upsert: false }
  );

  assert.equal(skipped.modifiedCount, 0, 'Upsert omitted must not insert');
  assert.equal(skippedFalse.modifiedCount, 0, 'upsert:false must not insert');

  const absentRows = await harness.readCollection('agents', { agent_id: absentId });
  assert.equal(absentRows.length, 0, 'Omitted/false upsert must leave the table untouched');
});

const teardown = await harness.close();

console.log('');
console.log(
  `teardown: listenerClosed=${teardown.listenerClosed} portReleased=${teardown.portReleased}`
);
console.log(`requests issued: ${teardown.requestsIssued}`);
console.log('');

process.exit(runner.finish({ gapsFail: true }));
