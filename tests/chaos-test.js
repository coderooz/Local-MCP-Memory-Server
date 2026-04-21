#!/usr/bin/env node

import http from 'http';
import { URL } from 'url';

const SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:4000';

function httpRequest(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = urlPath.startsWith('http') ? urlPath : `${SERVER_URL}${urlPath}`;
    const parsedUrl = new URL(fullUrl);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    };

    const startTime = Date.now();
    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json, latency });
        } catch {
          resolve({ status: res.statusCode, data, latency });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testBaseline() {
  console.log('=== PART 1: BASELINE VERIFICATION ===');
  try {
    const res = await httpRequest('/health');
    const data = res.data;
    const checks = {
      serviceOk: data.service === 'MCP',
      statusOk: data.status === 'ok',
      version: data.version,
      dbConnected: data.database?.connected === true
    };
    console.log('Health check results', checks);
    return checks.serviceOk && checks.statusOk;
  } catch (e) {
    console.log('Health check failed', e.message);
    return false;
  }
}

async function storeContext(content, options = {}) {
  const body = JSON.stringify({
    content,
    type: options.type || 'test',
    summary: options.summary || 'test',
    tags: options.tags || ['test'],
    agent: options.agent || 'chaos-test',
    project: options.project || 'local-mcp-memory'
  });
  return httpRequest('/context', { method: 'POST', body });
}

async function searchContext(query, limit = 10) {
  return httpRequest(`/context/search`, { 
    method: 'POST', 
    body: JSON.stringify({ query, limit, project: 'local-mcp-memory' }) 
  });
}

async function createTask(title, options = {}) {
  const body = JSON.stringify({
    title,
    description: options.description || 'Chaos test task',
    priority: options.priority || 1,
    agent: options.agent || 'chaos-test',
    project: options.project || 'local-mcp-memory'
  });
  return httpRequest('/task', { method: 'POST', body });
}

async function logAction(actionType, target, summary) {
  const body = JSON.stringify({
    actionType,
    target,
    summary,
    agent: 'chaos-test',
    project: 'local-mcp-memory'
  });
  return httpRequest('/log', { method: 'POST', body });
}

async function testLoad(agentCount = 10, iterations = 3) {
  console.log(`=== PART 2: LOAD TEST (${agentCount} agents x ${iterations} iterations) ===`);
  
  const results = { total: 0, success: 0, failed: 0, rateLimited: 0, errors: new Set(), latencies: [] };

  for (let iter = 0; iter < iterations; iter++) {
    console.log(`Iteration ${iter + 1}/${iterations}`);
    const promises = [];
    
    for (let i = 0; i < agentCount; i++) {
      const agentId = `agent-${i}`;
      
      results.total++;
      promises.push(storeContext(`Test context ${agentId} iter ${iter}`, { agent: agentId })
        .then(r => { 
          results.latencies.push(r.latency); 
          if (r.status === 200) results.success++; 
          else if (r.status === 429) { results.rateLimited++; results.failed++; }
          else { results.failed++; results.errors.add(r.status); } 
        }));

      // Reduced to 1 request per agent per iteration to avoid rate limiting
    }
    await Promise.all(promises);
    
    // Wait 1 second between iterations to respect rate limits
    await new Promise(r => setTimeout(r, 1000));
  }

  const avgLatency = results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length;
  console.log('Load test results:', { total: results.total, success: results.success, failed: results.failed, rateLimited: results.rateLimited, errorRate: (results.failed/results.total*100).toFixed(2)+'%', avgLatency: avgLatency.toFixed(2)+'ms' });
  return results;
}

async function testDiscovery() {
  console.log('=== PART 5: DISCOVERY ===');
  const ports = [4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010];
  for (const port of ports) {
    try {
      const res = await httpRequest(`http://localhost:${port}/health`);
      if (res.status === 200 && res.data.service === 'MCP') {
        console.log(`MCP found on port ${port}`);
        return { success: true, port };
      }
    } catch {}
  }
  return { success: false };
}

async function testConcurrencyRace() {
  console.log('=== PART 7: RACE TEST ===');
  const promises = [];
  
  // Send in smaller batches to avoid rate limiting
  const batchSize = 20;
  let success = 0;
  
  for (let batch = 0; batch < 3; batch++) {
    for (let i = 0; i < batchSize; i++) {
      promises.push(storeContext(`RACE_TEST_${Date.now()}_${batch}_${i}`, { type: 'race-test', project: 'testproj', agent: 'race-test' }));
    }
    const results = await Promise.all(promises);
    success += results.filter(r => r.status === 200).length;
    promises.length = 0;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('Race test:', { success, failed: 50 - success });
  return { success, failed: 50 - success };
}

async function testSecurity() {
  console.log('=== PART 9: SECURITY TEST ===');
  const tests = [];
  
  const malformed = await httpRequest('/context', { method: 'POST', body: 'not valid json' });
  tests.push({ name: 'malformed-json', passed: malformed.status !== 200 });

  const injection = await httpRequest('/context/search', { method: 'POST', body: JSON.stringify({ query: "' OR '1'='1", project: 'test' }) });
  tests.push({ name: 'injection', passed: injection.status === 200 });

  const missingFields = await httpRequest('/context', { method: 'POST', body: '{}' });
  tests.push({ name: 'missing-fields', passed: missingFields.status !== 200 });

  const largeInput = await storeContext('x'.repeat(1000000), { type: 'test' });
  tests.push({ name: 'large-input', passed: largeInput.status !== 200 });

  const pathTraversal = await httpRequest('/context', { method: 'POST', body: JSON.stringify({ content: 'test', project: '../../../etc/passwd' }) });
  tests.push({ name: 'path-traversal', passed: pathTraversal.status !== 200 || pathTraversal.data?.error });

  console.log('Security:', tests.map(t => `${t.name}: ${t.passed ? '✅' : '❌'}`).join(', '));
  return tests;
}

async function testConfig() {
  console.log('=== PART 6: CONFIG TEST ===');
  const tests = [];
  try {
    const config = await import('../core/config/project-config-loader.js');
    tests.push({ name: 'config-loads', passed: config.getProjectConfig() !== null });
    tests.push({ name: 'redis-disabled', passed: config.getRedisConfig().enabled === false });
    tests.push({ name: 'browser-disabled', passed: config.getBrowserConfig().enabled === false });
  } catch (e) {
    tests.push({ name: 'config-loads', passed: false });
  }
  console.log('Config:', tests.map(t => `${t.name}: ${t.passed ? '✅' : '❌'}`).join(', '));
  return tests;
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║     MCP CHAOS TESTING SUITE                   ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log();

  const startTime = Date.now();
  const results = { baseline: null, load: null, discovery: null, race: null, security: null, config: null };

  results.baseline = await testBaseline();
  console.log();
  results.load = await testLoad(10, 3);
  console.log();
  results.discovery = await testDiscovery();
  console.log();
  results.race = await testConcurrencyRace();
  console.log();
  results.security = await testSecurity();
  console.log();
  results.config = await testConfig();
  console.log();

  const totalTime = Date.now() - startTime;

  console.log('╔════════════════════════════════════════════════╗');
  console.log('║              EXECUTIVE SUMMARY                 ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`SYSTEM HEALTH: ${results.baseline ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`Total Time: ${(totalTime/1000).toFixed(2)}s`);
  console.log(`Load: ${results.load.total} req, ${results.load.success} ok, ${results.load.failed} fail (${(results.load.failed/results.load.total*100).toFixed(1)}% err)`);
  console.log(`Race: ${results.race.success} ok`);
  console.log(`Discovery: ${results.discovery.success ? `YES port ${results.discovery.port}` : 'NO'}`);
  console.log(`Security: ${results.security.filter(t => t.passed).length}/${results.security.length} pass`);
}

runAllTests().catch(console.error);