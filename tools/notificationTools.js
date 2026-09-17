import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SOUND_PATH = path.resolve(__dirname, '..', 'assets', 'alert.mp3');
const MAX_REPEAT = 5;

function createStructuredResponse(success, data = null, error = null, meta = {}) {
  return {
    success,
    ...(data !== null && { data }),
    ...(error && { error }),
    meta: { timestamp: Date.now(), ...meta }
  };
}

function getNotificationSoundPath() {
  return path.resolve(process.env.MCP_NOTIFICATION_SOUND_PATH || DEFAULT_SOUND_PATH);
}

function validateRepeat(repeat) {
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > MAX_REPEAT) {
    return `repeat must be an integer between 1 and ${MAX_REPEAT}`;
  }

  return null;
}

function quotePowerShellString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function encodePowerShellCommand(command) {
  return Buffer.from(command, 'utf16le').toString('base64');
}

function commandExists(command) {
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(lookup, [command], {
    stdio: 'ignore',
    windowsHide: true
  });

  return result.status === 0;
}

function spawnDetached(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  child.on('error', () => {});
  child.unref();
}

function playWithPowerShell(soundPath, repeat) {
  const powershell = commandExists('powershell.exe')
    ? 'powershell.exe'
    : commandExists('pwsh.exe')
      ? 'pwsh.exe'
      : null;

  if (!powershell) {
    throw new Error('PowerShell is required to play notification sounds on Windows.');
  }

  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName presentationCore
$soundPath = ${quotePowerShellString(soundPath)}
$repeat = ${repeat}
$player = New-Object System.Windows.Media.MediaPlayer
$opened = $false
$player.add_MediaOpened({ $script:opened = $true })
$player.Open([Uri]$soundPath)
$openStarted = Get-Date
while (-not $opened -and ((Get-Date) - $openStarted).TotalMilliseconds -lt 3000) {
  Start-Sleep -Milliseconds 50
}
for ($i = 0; $i -lt $repeat; $i++) {
  $ended = $false
  $player.add_MediaEnded({ $script:ended = $true })
  $player.Position = [TimeSpan]::Zero
  $player.Play()
  $playStarted = Get-Date
  while (-not $ended -and ((Get-Date) - $playStarted).TotalMilliseconds -lt 15000) {
    Start-Sleep -Milliseconds 100
  }
  $player.Stop()
}
$player.Close()
`;

  spawnDetached(powershell, [
    '-NoProfile',
    ...(powershell === 'powershell.exe' ? ['-Sta'] : []),
    '-ExecutionPolicy',
    'Bypass',
    '-EncodedCommand',
    encodePowerShellCommand(script)
  ]);
}

function getUnixAudioCommand() {
  if (process.platform === 'darwin' && commandExists('afplay')) {
    return { command: 'afplay', args: [] };
  }

  const candidates = [
    { command: 'ffplay', args: ['-nodisp', '-autoexit', '-loglevel', 'quiet'] },
    { command: 'mpg123', args: ['-q'] },
    { command: 'play', args: ['-q'] }
  ];

  return candidates.find((candidate) => commandExists(candidate.command)) || null;
}

function playWithUnixPlayer(soundPath, repeat) {
  const player = getUnixAudioCommand();
  if (!player) {
    throw new Error('No supported audio player found. Install afplay, ffplay, mpg123, or play.');
  }

  for (let i = 0; i < repeat; i++) {
    spawnDetached(player.command, [...player.args, soundPath]);
  }
}

export async function playNotificationSound({ repeat = 1, dryRun = false } = {}) {
  try {
    const repeatError = validateRepeat(repeat);
    if (repeatError) {
      return createStructuredResponse(false, null, repeatError);
    }

    const soundPath = getNotificationSoundPath();
    if (!fs.existsSync(soundPath)) {
      return createStructuredResponse(false, null, `Notification sound not found: ${soundPath}`);
    }

    if (!dryRun) {
      if (process.platform === 'win32') {
        playWithPowerShell(soundPath, repeat);
      } else {
        playWithUnixPlayer(soundPath, repeat);
      }
    }

    return createStructuredResponse(true, {
      message: dryRun ? 'Notification sound is available' : 'Notification sound triggered',
      soundPath,
      repeat,
      dryRun
    });
  } catch (error) {
    return createStructuredResponse(false, null, error.message);
  }
}

export function getNotificationTools() {
  return [
    {
      name: 'play_notification_sound',
      description:
        'Play the configured notification sound to attract the user attention when input or review is needed.',
      inputSchema: {
        type: 'object',
        properties: {
          repeat: {
            type: 'integer',
            description: `Number of times to play the sound, from 1 to ${MAX_REPEAT}. Defaults to 1.`
          },
          dryRun: {
            type: 'boolean',
            description: 'Check that the notification sound is available without playing it.'
          }
        }
      }
    }
  ];
}
