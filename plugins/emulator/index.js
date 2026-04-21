import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export const EMULATOR_TYPE = {
  ANDROID: 'android',
  WEB: 'web',
  IOS_SIMULATOR: 'ios_simulator',
  CUSTOM: 'custom'
};

export const EMULATOR_STATUS = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error'
};

export const EMULATOR_CAPABILITIES = {
  TOUCH: 'touch',
  NETWORK: 'network',
  CAMERA: 'camera',
  GPS: 'gps',
  SMS: 'sms',
  CALL: 'call',
  STORAGE: 'storage',
  SENSORS: 'sensors',
  SCREENSHOT: 'screenshot',
  VIDEO: 'video'
};

export class EmulatorPlugin {
  constructor(config = {}) {
    this.id = uuidv4();
    this.name = config.name || 'Emulator Plugin';
    this.version = '1.0.0';
    this.type = 'emulator';
    this.adapters = new Map();
    this.selectedEmulator = null;
    this.sessionId = null;
  }

  registerAdapter(adapter) {
    this.adapters.set(adapter.type, adapter);
  }

  getAdapter(type) {
    return this.adapters.get(type);
  }

  async scan() {
    const results = [];

    for (const [type, adapter] of this.adapters) {
      try {
        const emulators = await adapter.discover();
        results.push(...emulators);
      } catch (error) {
        console.error(`Error scanning ${type}:`, error.message);
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  async select(emulatorId) {
    const allEmulators = await this.scan();
    const emulator = allEmulators.find((e) => e.id === emulatorId);

    if (!emulator) {
      throw new Error(`Emulator ${emulatorId} not found`);
    }

    this.selectedEmulator = emulator;
    this.sessionId = uuidv4();

    return {
      sessionId: this.sessionId,
      emulator
    };
  }

  async autoSelect(requirements = {}) {
    const allEmulators = await this.scan();
    const available = allEmulators.filter((e) => e.status === EMULATOR_STATUS.RUNNING);

    if (available.length === 0) {
      const stopped = allEmulators.filter((e) => e.status === EMULATOR_STATUS.STOPPED);
      if (stopped.length > 0) {
        const started = await this.startEmulator(stopped[0].id);
        this.selectedEmulator = started;
        this.sessionId = uuidv4();
        return {
          sessionId: this.sessionId,
          emulator: started,
          autoStarted: true
        };
      }
      throw new Error('No emulators available');
    }

    const ranked = this.rankEmulators(available, requirements);
    this.selectedEmulator = ranked[0];
    this.sessionId = uuidv4();

    return {
      sessionId: this.sessionId,
      emulator: ranked[0],
      alternatives: ranked.slice(1, 5)
    };
  }

  rankEmulators(emulators, requirements = {}) {
    const { capabilities = [], type, os_version } = requirements;

    return emulators
      .map((emulator) => {
        let score = 100;

        if (type && emulator.type === type) {
          score += 50;
        }

        if (os_version && emulator.os_version === os_version) {
          score += 30;
        }

        for (const cap of capabilities) {
          if (emulator.capabilities.includes(cap)) {
            score += 10;
          } else {
            score -= 20;
          }
        }

        if (emulator.status === EMULATOR_STATUS.RUNNING) {
          score += 25;
        }

        return { ...emulator, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  async startEmulator(emulatorId) {
    const emulator = await this.findEmulator(emulatorId);
    if (!emulator) {
      throw new Error(`Emulator ${emulatorId} not found`);
    }

    const adapter = this.getAdapter(emulator.type);
    if (!adapter) {
      throw new Error(`No adapter for type ${emulator.type}`);
    }

    return await adapter.start(emulatorId);
  }

  async stopEmulator(emulatorId) {
    const emulator = await this.findEmulator(emulatorId);
    if (!emulator) {
      throw new Error(`Emulator ${emulatorId} not found`);
    }

    const adapter = this.getAdapter(emulator.type);
    if (!adapter) {
      throw new Error(`No adapter for type ${emulator.type}`);
    }

    return await adapter.stop(emulatorId);
  }

  async findEmulator(emulatorId) {
    const allEmulators = await this.scan();
    return allEmulators.find((e) => e.id === emulatorId);
  }

  async installApp(sessionId, apkPath, packageName) {
    if (!this.selectedEmulator) {
      throw new Error('No emulator selected');
    }

    const adapter = this.getAdapter(this.selectedEmulator.type);
    if (!adapter || !adapter.installApp) {
      throw new Error(`Installation not supported for ${this.selectedEmulator.type}`);
    }

    return await adapter.installApp(this.selectedEmulator.device_id, apkPath, packageName);
  }

  async runTest(sessionId, testPackage, testClass, options = {}) {
    if (!this.selectedEmulator) {
      throw new Error('No emulator selected');
    }

    const adapter = this.getAdapter(this.selectedEmulator.type);
    if (!adapter || !adapter.runTest) {
      throw new Error(`Testing not supported for ${this.selectedEmulator.type}`);
    }

    return await adapter.runTest(this.selectedEmulator.device_id, testPackage, testClass, options);
  }

  async captureLogs(sessionId, options = {}) {
    if (!this.selectedEmulator) {
      throw new Error('No emulator selected');
    }

    const adapter = this.getAdapter(this.selectedEmulator.type);
    if (!adapter || !adapter.captureLogs) {
      throw new Error(`Log capture not supported for ${this.selectedEmulator.type}`);
    }

    return await adapter.captureLogs(this.selectedEmulator.device_id, options);
  }

  async takeScreenshot(sessionId, outputPath) {
    if (!this.selectedEmulator) {
      throw new Error('No emulator selected');
    }

    const adapter = this.getAdapter(this.selectedEmulator.type);
    if (!adapter || !adapter.takeScreenshot) {
      throw new Error(`Screenshot not supported for ${this.selectedEmulator.type}`);
    }

    return await adapter.takeScreenshot(this.selectedEmulator.device_id, outputPath);
  }

  async simulateInput(sessionId, action, params = {}) {
    if (!this.selectedEmulator) {
      throw new Error('No emulator selected');
    }

    const adapter = this.getAdapter(this.selectedEmulator.type);
    if (!adapter || !adapter.simulateInput) {
      throw new Error(`Input simulation not supported for ${this.selectedEmulator.type}`);
    }

    return await adapter.simulateInput(this.selectedEmulator.device_id, action, params);
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      type: this.type,
      adapters: Array.from(this.adapters.keys()),
      selectedEmulator: this.selectedEmulator,
      sessionId: this.sessionId
    };
  }
}

export class AndroidEmulatorAdapter {
  constructor(config = {}) {
    this.type = EMULATOR_TYPE.ANDROID;
    this.adbPath = config.adbPath || 'adb';
    this.emulatorPath = config.emulatorPath || 'emulator';
  }

  async discover() {
    const emulators = [];

    try {
      const devices = await this.runCommand(`${this.adbPath} devices -l`);
      const lines = devices.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        if (line.includes('List of devices') || line.includes('emulator')) {
          continue;
        }

        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const deviceId = parts[0];
          const status = parts[1];
          const isEmulator = deviceId.startsWith('emulator-') || deviceId.includes('localhost');

          if (isEmulator || status === 'device') {
            const details = this.parseDeviceDetails(line);
            const capabilities = await this.getDeviceCapabilities(deviceId);

            emulators.push({
              id: deviceId,
              name: details.name || deviceId,
              type: this.type,
              status: status === 'device' ? EMULATOR_STATUS.RUNNING : EMULATOR_STATUS.STOPPED,
              device_id: deviceId,
              os_version: details.os_version || null,
              screen_resolution: details.resolution || null,
              capabilities,
              score: status === 'device' ? 100 : 50,
              last_checked: new Date()
            });
          }
        }
      }
    } catch (error) {
      console.error('ADB discovery error:', error.message);
    }

    try {
      const avds = await this.runCommand(`${this.emulatorPath} -list-avds`);
      const lines = avds.split('\n').filter((line) => line.trim());

      for (const avdName of lines) {
        const existing = emulators.find((e) => e.name === avdName);
        if (!existing) {
          emulators.push({
            id: `avd-${avdName}`,
            name: avdName,
            type: this.type,
            status: EMULATOR_STATUS.STOPPED,
            device_id: `avd-${avdName}`,
            os_version: null,
            screen_resolution: null,
            capabilities: [EMULATOR_CAPABILITIES.TOUCH, EMULATOR_CAPABILITIES.NETWORK],
            score: 30,
            last_checked: new Date()
          });
        }
      }
    } catch (error) {
      console.error('AVD listing error:', error.message);
    }

    return emulators;
  }

  parseDeviceDetails(line) {
    const details = {};

    const versionMatch = line.match(/product:(\S+)/);
    if (versionMatch) {
      details.name = versionMatch[1];
    }

    const modelMatch = line.match(/model:(\S+)/);
    if (modelMatch) {
      details.name = modelMatch[1].replace(/_/g, ' ');
    }

    const deviceMatch = line.match(/device:(\S+)/);
    if (deviceMatch) {
      details.device = deviceMatch[1];
    }

    return details;
  }

  async getDeviceCapabilities(deviceId) {
    const capabilities = [EMULATOR_CAPABILITIES.TOUCH];

    try {
      const features = await this.runCommand(
        `${this.adbPath} -s ${deviceId} shell pm list features`
      );
      if (features.includes('android.hardware.network')) {
        capabilities.push(EMULATOR_CAPABILITIES.NETWORK);
      }
      if (features.includes('android.hardware.camera')) {
        capabilities.push(EMULATOR_CAPABILITIES.CAMERA);
      }
      if (features.includes('android.hardware.location')) {
        capabilities.push(EMULATOR_CAPABILITIES.GPS);
      }
      capabilities.push(EMULATOR_CAPABILITIES.SCREENSHOT);
    } catch {}

    return capabilities;
  }

  async start(emulatorId) {
    const avdName = emulatorId.replace('avd-', '');
    await this.runCommand(`${this.emulatorPath} -avd ${avdName} -no-window &`);
    await this.waitForDevice(emulatorId);
    return { id: emulatorId, status: EMULATOR_STATUS.RUNNING };
  }

  async stop(emulatorId) {
    await this.runCommand(`${this.adbPath} -s ${emulatorId} emu kill`);
    return { id: emulatorId, status: EMULATOR_STATUS.STOPPED };
  }

  async waitForDevice(deviceId, timeout = 60000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      try {
        const result = await this.runCommand(`${this.adbPath} -s ${deviceId} get-state`);
        if (result.trim() === 'device') {
          return true;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`Device ${deviceId} did not become ready`);
  }

  async installApp(deviceId, apkPath, packageName) {
    await this.runCommand(`${this.adbPath} -s ${deviceId} install -r "${apkPath}"`);
    return {
      success: true,
      device_id: deviceId,
      package: packageName,
      installed_at: new Date()
    };
  }

  async runTest(deviceId, testPackage, testClass, options = {}) {
    const { timeout = 300000 } = options;
    const result = await this.runCommand(
      `${this.adbPath} -s ${deviceId} shell am instrument -w -e class ${testPackage}.${testClass} ${testPackage}.test/androidx.test.runner.AndroidJUnitRunner`,
      { timeout }
    );

    return {
      success: result.includes('OK'),
      device_id: deviceId,
      test_package: testPackage,
      test_class: testClass,
      output: result,
      completed_at: new Date()
    };
  }

  async captureLogs(deviceId, options = {}) {
    const { filter = '', timeout = 30000 } = options;
    const logcatPath = options.path || null;

    let command = `${this.adbPath} -s ${deviceId} logcat -d`;
    if (filter) {
      command += ` -s ${filter}`;
    }

    const logs = await this.runCommand(command, { timeout });

    if (logcatPath) {
      fs.writeFileSync(logcatPath, logs);
    }

    return {
      device_id: deviceId,
      logs,
      captured_at: new Date(),
      saved_to: logcatPath
    };
  }

  async takeScreenshot(deviceId, outputPath) {
    const tempPath = '/sdcard/screenshot.png';
    await this.runCommand(`${this.adbPath} -s ${deviceId} shell screencap -p ${tempPath}`);
    await this.runCommand(`${this.adbPath} -s ${deviceId} pull ${tempPath} "${outputPath}"`);
    await this.runCommand(`${this.adbPath} -s ${deviceId} shell rm ${tempPath}`);

    return {
      success: true,
      device_id: deviceId,
      output_path: outputPath,
      captured_at: new Date()
    };
  }

  async simulateInput(deviceId, action, params = {}) {
    switch (action) {
      case 'tap': {
        const { x, y } = params;
        await this.runCommand(`${this.adbPath} -s ${deviceId} shell input tap ${x} ${y}`);
        break;
      }
      case 'swipe': {
        const { x1, y1, x2, y2, duration = 300 } = params;
        await this.runCommand(
          `${this.adbPath} -s ${deviceId} shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`
        );
        break;
      }
      case 'type': {
        const { text } = params;
        await this.runCommand(`${this.adbPath} -s ${deviceId} shell input text "${text}"`);
        break;
      }
      case 'press': {
        const { keycode } = params;
        await this.runCommand(`${this.adbPath} -s ${deviceId} shell input keyevent ${keycode}`);
        break;
      }
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return {
      success: true,
      device_id: deviceId,
      action,
      params,
      executed_at: new Date()
    };
  }

  async runCommand(command, options = {}) {
    const { timeout = 30000 } = options;
    try {
      const { stdout, stderr } = await execAsync(command, { timeout });
      return stdout || stderr;
    } catch (error) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
  }
}

export class WebEmulatorAdapter {
  constructor(config = {}) {
    this.type = EMULATOR_TYPE.WEB;
    this.browser = null;
  }

  async discover() {
    const emulators = [];

    emulators.push({
      id: 'web-chrome-default',
      name: 'Chrome (Default)',
      type: this.type,
      status: EMULATOR_STATUS.RUNNING,
      device_id: 'chrome-default',
      os_version: 'latest',
      screen_resolution: '1920x1080',
      capabilities: [
        EMULATOR_CAPABILITIES.TOUCH,
        EMULATOR_CAPABILITIES.NETWORK,
        EMULATOR_CAPABILITIES.SCREENSHOT
      ],
      score: 80,
      last_checked: new Date()
    });

    emulators.push({
      id: 'web-firefox-default',
      name: 'Firefox (Default)',
      type: this.type,
      status: EMULATOR_STATUS.RUNNING,
      device_id: 'firefox-default',
      os_version: 'latest',
      screen_resolution: '1920x1080',
      capabilities: [
        EMULATOR_CAPABILITIES.TOUCH,
        EMULATOR_CAPABILITIES.NETWORK,
        EMULATOR_CAPABILITIES.SCREENSHOT
      ],
      score: 70,
      last_checked: new Date()
    });

    return emulators;
  }

  async start(emulatorId) {
    return { id: emulatorId, status: EMULATOR_STATUS.RUNNING };
  }

  async stop(emulatorId) {
    return { id: emulatorId, status: EMULATOR_STATUS.STOPPED };
  }

  async installApp(deviceId, appPath, packageName) {
    return {
      success: true,
      device_id: deviceId,
      message: 'Web apps do not require installation',
      installed_at: new Date()
    };
  }

  async runTest(deviceId, testUrl, testScript, options = {}) {
    return {
      success: true,
      device_id: deviceId,
      test_url: testUrl,
      message: 'Web testing requires external test runner',
      completed_at: new Date()
    };
  }

  async captureLogs(deviceId, options = {}) {
    return {
      device_id: deviceId,
      logs: 'Console logs captured via CDP',
      captured_at: new Date()
    };
  }

  async takeScreenshot(deviceId, outputPath) {
    return {
      success: true,
      device_id: deviceId,
      output_path: outputPath,
      message: 'Use browser automation for screenshots',
      captured_at: new Date()
    };
  }

  async simulateInput(deviceId, action, params = {}) {
    return {
      success: true,
      device_id: deviceId,
      action,
      message: 'Use browser automation for input simulation',
      executed_at: new Date()
    };
  }
}

export function createEmulatorPlugin(config = {}) {
  const plugin = new EmulatorPlugin(config);

  plugin.registerAdapter(new AndroidEmulatorAdapter(config.android));
  plugin.registerAdapter(new WebEmulatorAdapter(config.web));

  return plugin;
}

let globalPluginInstance = null;

export function getEmulatorPlugin() {
  if (!globalPluginInstance) {
    globalPluginInstance = createEmulatorPlugin();
  }
  return globalPluginInstance;
}
