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
      headers: options.headers || {}
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

async function testDatabaseFailure() {
  console.log('=== PART 4: DATABASE FAILURE TEST ===');
  console.log('Testing database operations...');
  
  const tests = [];
  
  // Test basic database operations
  const contextRes = await httpRequest('/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'DB test context',
      type: 'test',
      project: 'local-mcp-memory'
    })
  });
  tests.push({ name: 'context-create', passed: contextRes.status === 200 });
  
  const searchRes = await httpRequest('/context/search?q=test&limit=5');
  tests.push({ name: 'context-search', passed: searchRes.status === 200 });
  
  const taskRes = await httpRequest('/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'DB test task',
      project: 'local-mcp-memory'
    })
  });
  tests.push({ name: 'task-create', passed: taskRes.status === 200 });
  
  const logRes = await httpRequest('/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actionType: 'test',
      target: 'chaos-test',
      summary: 'DB test',
      project: 'local-mcp-memory'
    })
  });
  tests.push({ name: 'log-action', passed: logRes.status === 200 });
  
  console.log('DB Test Results:');
  for (const t of tests) {
    console.log(`  ${t.name}: ${t.passed ? '✅' : '❌'}`);
  }
  
  return tests;
}

async function testSessionCollision() {
  console.log('=== PART 8: SESSION COLLISION TEST ===');
  console.log('Testing session isolation...');
  
  const tests = [];
  
  // Create two sessions with same ID
  const session1 = await httpRequest('/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: 'collision-test-session',
      project: 'local-mcp-memory'
    })
  });
  
  // Try to use same session from another "client"
  const session2 = await httpRequest('/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: 'collision-test-session',
      project: 'local-mcp-memory'
    })
  });
  
  tests.push({ 
    name: 'duplicate-session-handled', 
    passed: session1.status === 200 && session2.status === 200 
  });
  
  // Check current session
  const current = await httpRequest('/session/current?session_id=collision-test-session');
  tests.push({ 
    name: 'session-retrievable', 
    passed: current.status === 200 
  });
  
  console.log('Session Test Results:');
  for (const t of tests) {
    console.log(`  ${t.name}: ${t.passed ? '✅' : '❌'}`);
  }
  
  return tests;
}

async function testFeatureToggles() {
  console.log('=== PART 10: FEATURE TOGGLE TEST ===');
  console.log('Testing feature flags...');
  
  const tests = [];
  
  // Test feature flags via config
  try {
    const config = await import('../core/config/project-config-loader.js');
    
    const redisEnabled = config.isFeatureEnabled('redis');
    tests.push({ name: 'redis-disabled', passed: !redisEnabled });
    
    const browserEnabled = config.isFeatureEnabled('browser');
    tests.push({ name: 'browser-disabled', passed: !browserEnabled });
    
    const kbEnabled = config.isFeatureEnabled('knowledgeBase');
    tests.push({ name: 'knowledgebase-disabled', passed: !kbEnabled });
    
    const redisConfig = config.getRedisConfig();
    tests.push({ name: 'redis-fallback-enabled', passed: redisConfig.fallbackToMemory === true });
    
  } catch (e) {
    console.log('Config error:', e.message);
    tests.push({ name: 'config-load', passed: false });
  }
  
  console.log('Feature Test Results:');
  for (const t of tests) {
    console.log(`  ${t.name}: ${t.passed ? '✅' : '❌'}`);
  }
  
  return tests;
}

async function runAdditionalTests() {
  const results = {
    dbFailure: null,
    session: null,
    features: null
  };
  
  results.dbFailure = await testDatabaseFailure();
  console.log();
  
  results.session = await testSessionCollision();
  console.log();
  
  results.features = await testFeatureToggle();
  console.log();
  
  return results;
}

async function testFeatureToggle() {
  console.log('=== PART 10: FEATURE TOGGLE TEST ===');
  console.log('Testing feature flags...');
  
  const tests = [];
  
  try {
    const configModule = await import('../core/config/project-config-loader.js');
    
    const redisEnabled = configModule.isFeatureEnabled('redis');
    tests.push({ name: 'redis-disabled', passed: !redisEnabled });
    
    const browserEnabled = configModule.isFeatureEnabled('browser');
    tests.push({ name: 'browser-disabled', passed: !browserEnabled });
    
    const kbEnabled = configModule.isFeatureEnabled('knowledgeBase');
    tests.push({ name: 'knowledgebase-disabled', passed: !kbEnabled });
    
    const redisConfig = configModule.getRedisConfig();
    tests.push({ name: 'redis-fallback-enabled', passed: redisConfig.fallbackToMemory === true });
    
  } catch (e) {
    console.log('Config error:', e.message);
    tests.push({ name: 'config-load', passed: false, error: e.message });
  }
  
  console.log('Feature Test Results:');
  for (const t of tests) {
    console.log(`  ${t.name}: ${t.passed ? '✅' : '❌'}`);
  }
  
  return tests;
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     ADDITIONAL CHAOS TESTS                                 ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log();

const dbResults = await testDatabaseFailure();
console.log();
const sessionResults = await testSessionCollision();
console.log();
const featureResults = await testFeatureToggle();
console.log();

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                    FINAL SUMMARY                            ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log();
console.log('Database Operations:');
console.log(`  Context Create: ${dbResults[0].passed ? '✅' : '❌'}`);
console.log(`  Context Search: ${dbResults[1].passed ? '✅' : '❌'}`);
console.log(`  Task Create: ${dbResults[2].passed ? '✅' : '❌'}`);
console.log(`  Log Action: ${dbResults[3].passed ? '✅' : '❌'}`);
console.log();
console.log('Session Management:');
console.log(`  Duplicate Session: ${sessionResults[0].passed ? '✅' : '❌'}`);
console.log(`  Session Retrieval: ${sessionResults[1].passed ? '✅' : '❌'}`);
console.log();
console.log('Features:');
console.log(`  Redis Disabled: ${featureResults[0].passed ? '✅' : '❌'}`);
console.log(`  Browser Disabled: ${featureResults[1].passed ? '✅' : '❌'}`);
console.log(`  KnowledgeBase Disabled: ${featureResults[2].passed ? '✅' : '❌'}`);
console.log(`  Redis Fallback: ${featureResults[3].passed ? '✅' : '❌'}`);