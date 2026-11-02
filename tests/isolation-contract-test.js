#!/usr/bin/env node

/**
 * Isolation & Contract Verification Suite (WP-A)
 *
 * Verifies the EXISTING external contract of the active runtime without
 * changing it:
 *
 *   Part 0  harness self-verification
 *   Part 1  successful reads/writes return the documented result shape
 *   Part 2  invalid input and invalid scope produce the established error
 *            response (never a fabricated success)
 *   Part 3  the warnings[] / error distinction is preserved
 *   Part 4  session isolation on the LIVE request path
 *   Part 5  retry behaviour without retrying mutations silently
 *   Part 6  a failed operation never reports success
 *   Part 7  documented cross-project exceptions (unanchored search, global
 *            scope) are explicit
 *   Part 8  teardown evidence
 *
 * Behaviour that the repository does not currently implement is recorded as a
 * CHARACTERIZATION (observed semantics, explicitly marked unresolved) or as a
 * GAP DETECTOR (the desired invariant; open while the production gap is
 * unfixed). WP-A does not change production behaviour.
 */

import {
  assert,
  createHarness,
  createRunner,
  detectByIdProjectLeak,
  detectMutationLeak,
} from './helpers/isolation-harness.js';

const runner = createRunner({ title: 'Isolation & Contract Verification' });
const harness = await createHarness({ label: 'contract' });

const ALPHA = 'wp-a-contract-alpha';
const BETA = 'wp-a-contract-beta';
const stamp = `${process.pid.toString(36)}${Date.now().toString(36)}`;

console.log('='.repeat(60));
console.log('📋 Isolation & Contract Verification Suite (WP-A)');
console.log('='.repeat(60));
console.log(`   runtime: ${harness.baseUrl} (loopback, ephemeral)`);
console.log(`   database: ${harness.dbPath}`);
console.log('');

// ---------------------------------------------------------------------------
// Part 0: harness self-verification
// ---------------------------------------------------------------------------

console.log('📋 PART 0: Harness Self-Verification\n');

await runner.test('the harness targets an isolated runtime', () => {
  assert.ok(harness.baseUrl.startsWith('http://127.0.0.1:'), 'The harness must bind loopback');
  assert.ok(harness.port > 0, 'The harness must own a real ephemeral port');
  assert.ok(
    harness.port < 47000 || harness.port > 47020,
    `The harness must not use the shared 47000-47020 port range (got ${harness.port})`
  );
  assert.notEqual(harness.port, 3799, 'The harness must never use the e2e port 3799');
  assert.ok(
    harness.dbPath.includes('wp-a-'),
    'The harness database must live in an isolated temporary directory'
  );
});

await runner.test('detectors used by this suite behave as specified', () => {
  assert.ok(
    detectByIdProjectLeak({ context: { project: BETA } }, ALPHA).leaked,
    'Foreign-project payload must be detected'
  );
  assert.ok(
    !detectByIdProjectLeak({ context: { project: ALPHA } }, ALPHA).leaked,
    'Own-project payload must not be detected'
  );
  assert.ok(
    detectMutationLeak({ content: 'a' }, { content: 'b' }).mutated,
    'Changed content must be detected'
  );
});

// ---------------------------------------------------------------------------
// Part 1: documented result shapes
// ---------------------------------------------------------------------------

console.log('\n📋 PART 1: Result Shapes\n');

let alphaContextId = null;

await runner.test('POST /context returns the documented success shape', async () => {
  const response = await harness.request('POST', '/context', {
    body: {
      content: `contract alpha payload ${stamp}`,
      project: ALPHA,
      agent: 'wp-a-contract-agent',
      scope: 'project',
    },
  });

  assert.equal(response.status, 200, 'Creation must answer with HTTP 200');
  assert.ok(response.json, 'Creation must return a JSON body');
  assert.equal(response.json.success, true, 'Creation must report success:true');
  assert.ok(Array.isArray(response.json.warnings), 'Creation must return a warnings array');
  assert.ok(response.json.context, 'Creation must return the stored context');
  assert.equal(response.json.context.project, ALPHA, 'The stored context must keep its project');
  assert.equal(
    response.json.context.content,
    `contract alpha payload ${stamp}`,
    'The stored content must round-trip'
  );

  alphaContextId = response.json.context.id;
  assert.ok(alphaContextId, 'The stored context must expose its id');
});

await runner.test('GET /context/:id/full returns context, actions and versions', async () => {
  const response = await harness.request('GET', `/context/${alphaContextId}/full`);

  assert.equal(response.status, 200, 'The by-id read must answer with HTTP 200');
  assert.ok(response.json.context, 'The response must contain the context');
  assert.equal(response.json.context.id, alphaContextId, 'The response must contain the same id');
  assert.ok(Array.isArray(response.json.actions), 'The response must contain an actions array');
  assert.ok(Array.isArray(response.json.versions), 'The response must contain a versions array');
});

await runner.test('an anchored same-project by-id read remains authorized', async () => {
  const response = await harness.request('GET', `/context/${alphaContextId}/full`, {
    headers: { 'x-mcp-project': ALPHA },
  });

  assert.equal(response.status, 200, 'A same-project anchored read must answer with HTTP 200');
  assert.equal(
    response.json.context.id,
    alphaContextId,
    'The owner must still read its own context'
  );
});

await runner.test('POST /context/update returns the documented success shape', async () => {
  const response = await harness.request('POST', '/context/update', {
    body: {
      context_id: alphaContextId,
      updates: { content: `contract alpha updated ${stamp}` },
      reason: 'wp-a contract verification',
      agent: 'wp-a-contract-agent',
    },
  });

  assert.equal(response.status, 200, 'The update must answer with HTTP 200');
  assert.equal(response.json.success, true, 'The update must report success:true');
  assert.ok(Array.isArray(response.json.warnings), 'The update must return a warnings array');
  assert.equal(
    response.json.context.content,
    `contract alpha updated ${stamp}`,
    'The update must be applied to the stored context'
  );
});

await runner.test('an anchored same-project update remains authorized', async () => {
  const response = await harness.request('POST', '/context/update', {
    headers: { 'x-mcp-project': ALPHA },
    body: {
      context_id: alphaContextId,
      updates: { summary: `anchored update ${stamp}` },
      reason: 'wp-b anchored update',
      agent: 'wp-a-contract-agent',
    },
  });

  assert.equal(response.status, 200, 'A same-project anchored update must answer with HTTP 200');
  assert.equal(response.json.success, true, 'The owner must still update its own context');

  const stored = await harness.readCollection('contexts', { id: alphaContextId });
  assert.equal(stored.length, 1, 'The update must not create a second row');
  assert.equal(stored[0].summary, `anchored update ${stamp}`, 'The update must be persisted');
});

// ---------------------------------------------------------------------------
// Part 2: invalid input and invalid scope
// ---------------------------------------------------------------------------

console.log('\n📋 PART 2: Invalid Input and Invalid Scope\n');

await runner.test('POST /context without content fails without reporting success', async () => {
  const response = await harness.request('POST', '/context', {
    body: { project: ALPHA, agent: 'wp-a-contract-agent' },
  });

  assert.equal(response.status, 500, 'The established contract answers invalid input with 500');
  assert.ok(response.json, 'The error response must be JSON');
  assert.equal(response.json.success, false, 'The error response must report success:false');
  assert.ok(response.json.error, 'The error response must carry an error message');
  assert.includes(response.json.error, 'content or summary is required', 'Error text mismatch');
});

await runner.test('POST /context with an invalid project name is rejected', async () => {
  const response = await harness.request('POST', '/context', {
    body: {
      content: 'invalid project payload',
      project: 'bad project!',
      agent: 'wp-a-contract-agent',
    },
  });

  assert.equal(response.status, 500, 'An invalid project name must not be accepted');
  assert.equal(response.json.success, false, 'The rejection must report success:false');
  assert.includes(response.json.error, 'alphanumeric', 'Error text mismatch');
});

await runner.test('POST /context/update on an unknown id does not report success', async () => {
  const response = await harness.request('POST', '/context/update', {
    body: {
      context_id: `does-not-exist-${stamp}`,
      updates: { content: 'never applied' },
      agent: 'wp-a-contract-agent',
    },
  });

  assert.ok(response.json, 'The response must be JSON');
  assert.notEqual(response.json.success, true, 'A missing context must not report success:true');
  assert.includes(response.json.error, 'not found', 'Error text mismatch');
});

await runner.test('POST /context/update without updatable fields is rejected', async () => {
  const response = await harness.request('POST', '/context/update', {
    body: { context_id: alphaContextId, updates: {}, agent: 'wp-a-contract-agent' },
  });

  assert.ok(response.json, 'The response must be JSON');
  assert.notEqual(response.json.success, true, 'An empty update must not report success:true');
  assert.includes(response.json.error, 'No valid updates', 'Error text mismatch');
});

await runner.characterize(
  'GET /context/:id/full for an unknown id answers 200 with an error payload',
  async () => {
    const response = await harness.request('GET', `/context/${`missing-${stamp}`}/full`);

    return {
      observed: `status=${response.status} body=${JSON.stringify(response.json)}`,
      unresolved: true,
    };
  }
);

// ---------------------------------------------------------------------------
// Part 3: warnings[] versus error
// ---------------------------------------------------------------------------

console.log('\n📋 PART 3: Warnings versus Error\n');

await runner.test(
  'a concurrently locked context warns and still applies the update (INV-06)',
  async () => {
    const now = new Date().toISOString();

    await harness.db.collection('resource_locks').insertOne({
      id: `lock-${stamp}`,
      lock_id: `lock-${stamp}`,
      project: ALPHA,
      agent: 'wp-a-other-agent',
      locked_by: 'wp-a-other-agent',
      resource: `context:${alphaContextId}`,
      scope: 'project',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      createdAt: now,
      updatedAt: now,
    });

    const response = await harness.request('POST', '/context/update', {
      body: {
        context_id: alphaContextId,
        updates: { content: `contract alpha warned ${stamp}` },
        agent: 'wp-a-contract-agent',
      },
    });

    const stored = await harness.readCollection('contexts', { id: alphaContextId });
    const applied = stored.length === 1 && stored[0].content === `contract alpha warned ${stamp}`;

    assert.equal(response.json.success, true, 'A document write must not be refused by a lock');
    assert.ok(Array.isArray(response.json.warnings), 'The write must surface warnings[]');
    assert.ok(
      response.json.warnings.length > 0,
      'A foreign lock must produce a visible warning (INV-05/INV-06)'
    );
    assert.ok(applied, 'The warned write must still be applied (INV-06: warn, not block)');
  }
);

// ---------------------------------------------------------------------------
// Part 4: session isolation on the live request path
// ---------------------------------------------------------------------------

console.log('\n📋 PART 4: Session Isolation (Live Path)\n');

let sessionId = null;

await runner.test('POST /session creates and persists a session', async () => {
  const response = await harness.request('POST', '/session', {
    body: { agent: 'wp-a-session-agent', project: ALPHA, scope: 'project' },
  });

  assert.equal(response.status, 200, 'Session creation must answer with HTTP 200');
  assert.equal(response.json.success, true, 'Session creation must report success:true');
  assert.ok(response.json.session, 'Session creation must return the session');
  assert.ok(response.json.session.sessionId, 'The session must expose a sessionId');

  sessionId = response.json.session.sessionId;

  const persisted = await harness.readCollection('sessions', { sessionId });
  assert.equal(persisted.length, 1, 'The created session must be persisted exactly once');
});

await runner.test('GET /session/current without a session id reports no session', async () => {
  const response = await harness.request('GET', '/session/current');

  assert.equal(response.status, 200, 'The lookup must answer with HTTP 200');
  assert.equal(response.json.session, null, 'No session must be reported when none was presented');
  assert.ok(response.json.message, 'The response must explain the empty session');
});

await runner.test('an unknown session id is not resolved into a session', async () => {
  const response = await harness.request('GET', '/session/current', {
    headers: { 'x-mcp-session-id': `forged-${stamp}` },
  });

  assert.equal(response.status, 200, 'The lookup must answer with HTTP 200');
  assert.equal(
    response.json.session,
    null,
    'A forged session id must not resolve to a session object'
  );
  assert.includes(response.json.message, 'not found', 'Error text mismatch');
});

await runner.test('POST /session/heartbeat reports failure for an unknown session', async () => {
  const response = await harness.request('POST', '/session/heartbeat', {
    headers: { 'x-mcp-session-id': `forged-${stamp}` },
    body: {},
  });

  assert.equal(response.status, 200, 'The heartbeat must answer with HTTP 200');
  assert.equal(response.json.success, false, 'An unknown session must not report success:true');
});

await runner.test('the live session lifecycle resolves create, current and heartbeat', async () => {
  const lookup = await harness.request('GET', '/session/current', {
    headers: { 'x-mcp-session-id': sessionId },
  });

  assert.equal(lookup.status, 200, 'The lookup must answer with HTTP 200');
  assert.ok(lookup.json.session, 'A session created through POST /session must be resolvable');
  assert.equal(
    lookup.json.session.sessionId,
    sessionId,
    'The resolved session must be the one that was created'
  );

  const heartbeat = await harness.request('POST', '/session/heartbeat', {
    headers: { 'x-mcp-session-id': sessionId },
    body: {},
  });

  assert.equal(heartbeat.status, 200, 'The heartbeat must answer with HTTP 200');
  assert.equal(heartbeat.json.success, true, 'A live session must accept a heartbeat');
  assert.equal(
    heartbeat.json.session.sessionId,
    sessionId,
    'The heartbeat must answer for the resolved session'
  );

  const persisted = await harness.readCollection('sessions', { sessionId });
  assert.equal(persisted.length, 1, 'The session must be persisted exactly once');
});

await runner.gap(
  'INV-20: a session created through POST /session must be resolvable on the live path',
  async () => {
    const lookup = await harness.request('GET', '/session/current', {
      headers: { 'x-mcp-session-id': sessionId },
    });

    assert.ok(
      lookup.json.session,
      'INV-20 violated: the session created through POST /session cannot be resolved by ' +
        'GET /session/current, so no session identity survives the request path'
    );
  }
);

// ---------------------------------------------------------------------------
// Part 5: retry behaviour
// ---------------------------------------------------------------------------

console.log('\n📋 PART 5: Retry Behaviour\n');

await runner.test('a duplicated primary key fails and never duplicates the record', async () => {
  const explicitId = `wp-a-duplicate-${stamp}`;

  const first = await harness.request('POST', '/context', {
    body: {
      id: explicitId,
      content: `duplicate probe ${stamp}`,
      project: ALPHA,
      agent: 'wp-a-contract-agent',
      scope: 'project',
    },
  });

  assert.equal(first.status, 200, 'The first insert must succeed');
  assert.equal(first.json.context.id, explicitId, 'The explicit id must be honoured');

  const second = await harness.request('POST', '/context', {
    body: {
      id: explicitId,
      content: `duplicate probe ${stamp}`,
      project: ALPHA,
      agent: 'wp-a-contract-agent',
      scope: 'project',
    },
  });

  assert.notEqual(second.status, 200, 'The duplicated insert must not report success');
  assert.equal(second.json.success, false, 'The duplicated insert must report success:false');

  const stored = await harness.readCollection('contexts', { id: explicitId });
  assert.equal(stored.length, 1, 'Exactly one record may exist for the duplicated id');
});

await runner.test('distinct ids are stored independently', async () => {
  const stored = await harness.readCollection('contexts', { project: ALPHA });
  const ids = new Set(stored.map((entry) => entry.id));

  assert.equal(ids.size, stored.length, 'Every stored context must have a unique id');
  assert.ok(stored.length >= 2, 'Both contract contexts must be present');
});

// ---------------------------------------------------------------------------
// Part 6: failed operations must not report success
// ---------------------------------------------------------------------------

console.log('\n📋 PART 6: Failed Operations Must Not Report Success\n');

await runner.gap(
  'POST /agent/register must succeed and persist a newly registered agent',
  async () => {
    const agentId = `wp-a-registered-${stamp}`;

    const response = await harness.request('POST', '/agent/register', {
      body: { agent_id: agentId, project: ALPHA, status: 'active' },
    });

    assert.equal(
      response.status,
      200,
      `Registration of a new agent must succeed (observed status ${response.status}: ` +
        `${response.json && response.json.error})`
    );

    const stored = await harness.readCollection('agents', { agent_id: agentId });
    assert.equal(
      stored.length,
      1,
      'Registration reported success but persisted no agent row: the SQLite adapter ' +
        'ignores { upsert: true }, so the UPDATE matched zero rows and no row was inserted'
    );
  }
);

await runner.test('POST /agent/register is an idempotent upsert', async () => {
  const agentId = `wp-a-registered-char-${stamp}`;

  const first = await harness.request('POST', '/agent/register', {
    body: { agent_id: agentId, project: ALPHA, name: 'First Name', status: 'active' },
  });
  assert.equal(first.status, 200, 'The first registration must succeed');
  assert.equal(first.json.success, true, 'The first registration must report success:true');

  const firstRows = await harness.readCollection('agents', { agent_id: agentId });
  assert.equal(firstRows.length, 1, 'Registration must persist exactly one agent row');

  const second = await harness.request('POST', '/agent/register', {
    body: { agent_id: agentId, project: ALPHA, name: 'Second Name', status: 'idle' },
  });
  assert.equal(second.status, 200, 'A repeated registration must succeed');
  assert.equal(second.json.success, true, 'A repeated registration must report success:true');

  const secondRows = await harness.readCollection('agents', { agent_id: agentId });
  assert.equal(secondRows.length, 1, 'A repeated registration must not duplicate the agent row');
  assert.equal(
    secondRows[0].id,
    firstRows[0].id,
    'A repeated registration must update the existing row, not replace its identity'
  );
  assert.equal(
    secondRows[0].name,
    'Second Name',
    'A repeated registration must refresh the record'
  );
});

await runner.gap('POST /project-map must persist the entry it reports as stored', async () => {
  const filePath = `src/wpa-${stamp}.js`;

  const response = await harness.request('POST', '/project-map', {
    body: {
      file_path: filePath,
      project: ALPHA,
      agent: 'wp-a-contract-agent',
      summary: `project map probe ${stamp}`,
    },
  });

  assert.equal(
    response.status,
    200,
    `Project map write must succeed (observed status ${response.status}: ` +
      `${response.json && response.json.error})`
  );

  const stored = await harness.readCollection('project_map', { file_path: filePath });
  assert.equal(
    stored.length,
    1,
    'The project map entry was reported as stored but never persisted: the SQLite ' +
      'adapter ignores { upsert: true }'
  );
});

// ---------------------------------------------------------------------------
// Part 7: documented cross-project exceptions
// ---------------------------------------------------------------------------

console.log('\n📋 PART 7: Documented Exceptions\n');

await runner.characterize(
  'an unanchored search reads across projects (documented contract)',
  async () => {
    const _betaContext = await harness.request('POST', '/context', {
      body: {
        content: `unanchored beta payload ${stamp}`,
        project: BETA,
        agent: 'wp-a-beta-agent',
        scope: 'project',
      },
    });

    const response = await harness.request('POST', '/context/search', {
      body: { query: `unanchored beta payload ${stamp}` },
    });

    const hit = response.json.filter(
      (entry) => entry.content === `unanchored beta payload ${stamp}`
    );

    return {
      observed:
        `unanchored search returned ${hit.length} record(s) owned by ` +
        `${hit.map((entry) => entry.project).join(', ') || 'none'} ` +
        '(documented choice, see server.js /context/search)',
      unresolved: true,
    };
  }
);

await runner.characterize(
  'a project-anchored search does not return another project private-scoped records',
  async () => {
    const _privateContext = await harness.request('POST', '/context', {
      body: {
        content: `private beta payload ${stamp}`,
        project: BETA,
        agent: 'wp-a-beta-agent',
        scope: 'private',
      },
    });

    const response = await harness.request('POST', '/context/search', {
      body: { query: `private beta payload ${stamp}`, project: ALPHA },
    });

    const hit = response.json.filter((entry) => entry.content === `private beta payload ${stamp}`);

    return {
      observed: `private-scoped foreign records visible to a foreign project anchor: ${hit.length}`,
      unresolved: false,
    };
  }
);

// ---------------------------------------------------------------------------
// Part 8: teardown evidence
// ---------------------------------------------------------------------------

console.log('\n📋 PART 8: Teardown Evidence\n');

const teardown = await harness.close();

await runner.test('the harness released every resource it created', () => {
  assert.ok(teardown.listenerClosed, 'The HTTP listener must be closed');
  assert.ok(teardown.portReleased, 'The ephemeral port must be released');
  assert.ok(teardown.databaseClosed, 'The database connection must be closed');
  assert.ok(teardown.tempRootRemoved, 'The temporary root must be removed');
  assert.ok(teardown.dbFileRemoved, 'The temporary database file must be removed');
});

await runner.test('the suite stayed inside its request budget', () => {
  assert.ok(
    teardown.requestsIssued <= 100,
    `The suite issued ${teardown.requestsIssued} requests (budget 100)`
  );
});

process.exit(runner.finish({ gapsFail: false }));
