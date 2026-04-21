import { FEEDBACK_TYPE, FEEDBACK_STATUS, FEEDBACK_SEVERITY, FeedbackModel } from '../core/mcp/models.js';

function runTests() {
  console.log('=== Feedback System Tests ===\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${error.message}`);
      failed++;
    }
  }

  test('FeedbackModel should be instantiated with defaults', () => {
    const feedback = new FeedbackModel({});
    if (!feedback.feedback_id) {
      throw new Error('feedback_id not generated');
    }
    if (feedback.type !== FEEDBACK_TYPE.FEEDBACK) {
      throw new Error('Default type incorrect');
    }
    if (feedback.status !== FEEDBACK_STATUS.OPEN) {
      throw new Error('Default status incorrect');
    }
    if (feedback.severity !== FEEDBACK_SEVERITY.MEDIUM) {
      throw new Error('Default severity incorrect');
    }
  });

  test('FeedbackModel should accept all types', () => {
    const issue = new FeedbackModel({ type: FEEDBACK_TYPE.ISSUE });
    if (issue.type !== FEEDBACK_TYPE.ISSUE) {
      throw new Error('Issue type not set');
    }

    const improvement = new FeedbackModel({ type: FEEDBACK_TYPE.IMPROVEMENT });
    if (improvement.type !== FEEDBACK_TYPE.IMPROVEMENT) {
      throw new Error('Improvement type not set');
    }

    const feedback = new FeedbackModel({ type: FEEDBACK_TYPE.FEEDBACK });
    if (feedback.type !== FEEDBACK_TYPE.FEEDBACK) {
      throw new Error('Feedback type not set');
    }
  });

  test('FeedbackModel should clamp severity', () => {
    const low = new FeedbackModel({ severity: 0 });
    if (low.severity !== 1) {
      throw new Error('Severity should clamp to 1');
    }

    const high = new FeedbackModel({ severity: 10 });
    if (high.severity !== 5) {
      throw new Error('Severity should clamp to 5');
    }

    const valid = new FeedbackModel({ severity: 3 });
    if (valid.severity !== 3) {
      throw new Error('Valid severity should stay');
    }
  });

  test('FeedbackModel should store votes and voters', () => {
    const feedback = new FeedbackModel({
      votes: 5,
      voters: ['agent1', 'agent2']
    });
    if (feedback.votes !== 5) {
      throw new Error('Votes not stored');
    }
    if (feedback.voters.length !== 2) {
      throw new Error('Voters not stored');
    }
  });

  test('FeedbackModel should store related items', () => {
    const feedback = new FeedbackModel({
      related_contexts: ['ctx1', 'ctx2'],
      related_tasks: ['task1'],
      related_issues: ['issue1']
    });
    if (feedback.related_contexts.length !== 2) {
      throw new Error('Related contexts not stored');
    }
    if (feedback.related_tasks.length !== 1) {
      throw new Error('Related tasks not stored');
    }
    if (feedback.related_issues.length !== 1) {
      throw new Error('Related issues not stored');
    }
  });

  test('FeedbackModel should track resolution', () => {
    const feedback = new FeedbackModel({
      status: FEEDBACK_STATUS.RESOLVED,
      resolved_by: 'agent1',
      resolved_at: new Date(),
      resolution: 'Fixed the issue'
    });
    if (feedback.status !== FEEDBACK_STATUS.RESOLVED) {
      throw new Error('Status not set');
    }
    if (feedback.resolved_by !== 'agent1') {
      throw new Error('Resolved by not set');
    }
    if (feedback.resolution !== 'Fixed the issue') {
      throw new Error('Resolution not set');
    }
  });

  test('FeedbackModel should store metadata', () => {
    const feedback = new FeedbackModel({
      metadata: {
        source: 'automated',
        testName: 'login_test'
      }
    });
    if (!feedback.metadata.source) {
      throw new Error('Metadata not stored');
    }
  });

  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  return { passed, failed };
}

export { runTests as testFeedbackSystem };

runTests();
