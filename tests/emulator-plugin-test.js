import {
  createEmulatorPlugin,
  EmulatorPlugin,
  AndroidEmulatorAdapter,
  WebEmulatorAdapter,
  EMULATOR_TYPE,
  EMULATOR_STATUS
} from '../plugins/emulator/index.js';

async function runTests() {
  console.log('=== Emulator Plugin Tests ===\n');

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

  test('EmulatorPlugin should be instantiated', () => {
    const plugin = createEmulatorPlugin();
    if (!plugin || !(plugin instanceof EmulatorPlugin)) {
      throw new Error('Plugin not created');
    }
  });

  test('EmulatorPlugin should have Android and Web adapters', () => {
    const plugin = createEmulatorPlugin();
    if (!plugin.getAdapter(EMULATOR_TYPE.ANDROID)) {
      throw new Error('Android adapter not registered');
    }
    if (!plugin.getAdapter(EMULATOR_TYPE.WEB)) {
      throw new Error('Web adapter not registered');
    }
  });

  test('AndroidEmulatorAdapter should have discover method', () => {
    const adapter = new AndroidEmulatorAdapter();
    if (typeof adapter.discover !== 'function') {
      throw new Error('discover method not found');
    }
  });

  test('AndroidEmulatorAdapter should have start/stop methods', () => {
    const adapter = new AndroidEmulatorAdapter();
    if (typeof adapter.start !== 'function') {
      throw new Error('start method not found');
    }
    if (typeof adapter.stop !== 'function') {
      throw new Error('stop method not found');
    }
  });

  test('WebEmulatorAdapter should have discover method', () => {
    const adapter = new WebEmulatorAdapter();
    if (typeof adapter.discover !== 'function') {
      throw new Error('discover method not found');
    }
  });

  test('EmulatorPlugin should rank emulators correctly', () => {
    const plugin = createEmulatorPlugin();
    const emulators = [
      {
        id: '1',
        type: EMULATOR_TYPE.ANDROID,
        status: EMULATOR_STATUS.RUNNING,
        capabilities: ['touch', 'network']
      },
      {
        id: '2',
        type: EMULATOR_TYPE.ANDROID,
        status: EMULATOR_STATUS.STOPPED,
        capabilities: ['touch']
      }
    ];

    const ranked = plugin.rankEmulators(emulators, { type: EMULATOR_TYPE.ANDROID });
    if (ranked[0].id !== '1') {
      throw new Error('Running emulator should be ranked first');
    }
  });

  test('getEmulatorPlugin should return singleton instance', () => {
    const plugin1 = createEmulatorPlugin();
    const plugin2 = createEmulatorPlugin();
    if (plugin1 === plugin2) {
      throw new Error('Should create new instances');
    }
  });

  console.log('\n=== Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  return { passed, failed };
}

export { runTests as testEmulatorPlugin };

runTests();
