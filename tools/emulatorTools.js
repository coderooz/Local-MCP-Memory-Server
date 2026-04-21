export function scanEmulators(args, config) {
  return {
    name: 'emulator_scan',
    description:
      'Scan for available emulators and devices. Discovers Android emulators via ADB and web browser environments.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  };
}

export function selectEmulator(args, config) {
  return {
    name: 'emulator_select',
    description:
      'Select an emulator or automatically select the best available one based on requirements.',
    inputSchema: {
      type: 'object',
      properties: {
        emulator_id: {
          type: 'string',
          description: 'Specific emulator ID to select'
        },
        requirements: {
          type: 'object',
          description: 'Selection criteria',
          properties: {
            type: {
              type: 'string',
              enum: ['android', 'web', 'ios_simulator', 'custom'],
              description: 'Preferred emulator type'
            },
            capabilities: {
              type: 'array',
              items: { type: 'string' },
              description: 'Required capabilities (touch, network, camera, etc.)'
            },
            os_version: {
              type: 'string',
              description: 'Preferred OS version'
            }
          }
        }
      }
    }
  };
}

export function installApp(args, config) {
  return {
    name: 'emulator_install',
    description: 'Install an application on the selected emulator.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Emulator session ID'
        },
        apk_path: {
          type: 'string',
          description: 'Path to the APK file'
        },
        package_name: {
          type: 'string',
          description: 'Package name of the app'
        }
      },
      required: ['session_id', 'apk_path']
    }
  };
}

export function runTest(args, config) {
  return {
    name: 'emulator_run_test',
    description: 'Run automated tests on the selected emulator.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Emulator session ID'
        },
        test_package: {
          type: 'string',
          description: 'Test package name'
        },
        test_class: {
          type: 'string',
          description: 'Test class name'
        },
        options: {
          type: 'object',
          description: 'Test options',
          properties: {
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds'
            }
          }
        }
      },
      required: ['session_id', 'test_package', 'test_class']
    }
  };
}

export function captureLogs(args, config) {
  return {
    name: 'emulator_capture_logs',
    description: 'Capture logs from the emulator.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Emulator session ID'
        },
        filter: {
          type: 'string',
          description: 'Log filter (e.g., ActivityManager, System.out)'
        },
        path: {
          type: 'string',
          description: 'Optional path to save logs'
        },
        timeout: {
          type: 'number',
          description: 'Capture timeout in milliseconds'
        }
      },
      required: ['session_id']
    }
  };
}

export function takeScreenshot(args, config) {
  return {
    name: 'emulator_screenshot',
    description: 'Take a screenshot of the emulator screen.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Emulator session ID'
        },
        path: {
          type: 'string',
          description: 'Output path for screenshot file'
        }
      },
      required: ['session_id']
    }
  };
}

export function simulateInput(args, config) {
  return {
    name: 'emulator_input',
    description: 'Simulate user input on the emulator.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Emulator session ID'
        },
        action: {
          type: 'string',
          enum: ['tap', 'swipe', 'type', 'press'],
          description: 'Input action type'
        },
        params: {
          type: 'object',
          description: 'Action parameters',
          properties: {
            x: { type: 'number', description: 'X coordinate for tap' },
            y: { type: 'number', description: 'Y coordinate for tap' },
            x1: { type: 'number', description: 'Start X for swipe' },
            y1: { type: 'number', description: 'Start Y for swipe' },
            x2: { type: 'number', description: 'End X for swipe' },
            y2: { type: 'number', description: 'End Y for swipe' },
            duration: { type: 'number', description: 'Duration for swipe in ms' },
            text: { type: 'string', description: 'Text to type' },
            keycode: { type: 'number', description: 'Android keycode' }
          }
        }
      },
      required: ['session_id', 'action']
    }
  };
}

export function getEmulatorTools() {
  return [
    scanEmulators(),
    selectEmulator(),
    installApp(),
    runTest(),
    captureLogs(),
    takeScreenshot(),
    simulateInput()
  ];
}
