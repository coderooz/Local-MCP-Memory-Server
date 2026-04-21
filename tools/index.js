import { storeContext } from './store_context.js';
import * as browserTools from './browserTools.js';
import { getEmulatorTools } from './emulatorTools.js';
import { getFeedbackTools } from './feedbackTools.js';
import { getChatTools } from './chatTools.js';
import { getAllTools as getDomainTools } from '../src/interfaces/mcp-tools/tool-definitions.js';
const toolHandlers = {
  store_context: storeContext,
  open_browser: browserTools.openBrowser,
  close_browser: browserTools.closeBrowser,
  navigate_to_url: browserTools.navigateToUrl,
  get_page_content: browserTools.getPageContent,
  click_element: browserTools.clickElement,
  fill_input: browserTools.fillInput,
  get_element_text: browserTools.getElementText,
  evaluate_javascript: browserTools.evaluateJavaScript,
  take_screenshot: browserTools.takeScreenshot,
  wait_for_selector: browserTools.waitForSelector,
  get_page_title: browserTools.getPageTitle,
  get_current_url: browserTools.getCurrentUrl,
  reload_page: browserTools.reloadPage,
  go_back: browserTools.goBack,
  go_forward: browserTools.goForward,
  wait_for_timeout: browserTools.waitForTimeout,
  get_elements: browserTools.getElements,
  set_viewport: browserTools.setViewport,
  clear_cookies: browserTools.clearCookies,
  get_cookies: browserTools.getCookies,
  set_cookies: browserTools.setCookies,
  get_active_sessions: browserTools.getActiveSessions
};

export function getTools() {
  const baseTools = [
    {
      name: 'store_context',
      description: 'Store persistent memory such as architecture decisions, rules, or notes.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The memory content to store' },
          importance: { type: 'number', description: 'The importance of the memory (1-5)' }
        },
        required: ['content']
      }
    },
    {
      name: 'open_browser',
      description:
        'Initialize and open a browser session for automation. Returns sessionId for subsequent operations.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'Optional session ID. Auto-generated if not provided.'
          }
        }
      }
    },
    {
      name: 'close_browser',
      description: 'Close browser session and clean up resources.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'Session ID to close. Closes all if not provided.'
          }
        }
      }
    },
    {
      name: 'navigate_to_url',
      description: 'Navigate to a specific URL. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          url: { type: 'string', description: 'The URL to navigate to (http/https only)' },
          waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle'],
            description: 'When to consider navigation complete'
          }
        },
        required: ['sessionId', 'url']
      }
    },
    {
      name: 'get_page_content',
      description: 'Get the current page content as text or HTML. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          format: { type: 'string', enum: ['text', 'html'], description: 'Output format' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'click_element',
      description: 'Click an element on the page by CSS selector. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          selector: { type: 'string', description: 'CSS selector for the element' },
          timeout: { type: 'number', description: 'Timeout in milliseconds' }
        },
        required: ['sessionId', 'selector']
      }
    },
    {
      name: 'fill_input',
      description: 'Fill an input field with a value. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          selector: { type: 'string', description: 'CSS selector for the input' },
          value: { type: 'string', description: 'Value to fill' },
          clear: { type: 'boolean', description: 'Clear before filling (default: true)' }
        },
        required: ['sessionId', 'selector', 'value']
      }
    },
    {
      name: 'get_element_text',
      description: 'Get text content of an element. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          selector: { type: 'string', description: 'CSS selector' }
        },
        required: ['sessionId', 'selector']
      }
    },
    {
      name: 'evaluate_javascript',
      description:
        'Execute JavaScript in the browser context. Requires active session. Dangerous patterns are blocked.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          script: { type: 'string', description: 'JavaScript code to execute' }
        },
        required: ['sessionId', 'script']
      }
    },
    {
      name: 'take_screenshot',
      description: 'Take a screenshot of the current page. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          path: { type: 'string', description: 'Optional file path to save screenshot' },
          fullPage: { type: 'boolean', description: 'Capture full page (default: false)' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'wait_for_selector',
      description: 'Wait for an element to appear or disappear. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          selector: { type: 'string', description: 'CSS selector' },
          state: {
            type: 'string',
            enum: ['visible', 'hidden', 'attached', 'detached'],
            description: 'Element state to wait for'
          },
          timeout: { type: 'number', description: 'Timeout in ms (default: 10000)' }
        },
        required: ['sessionId', 'selector']
      }
    },
    {
      name: 'get_page_title',
      description: 'Get the current page title. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'get_current_url',
      description: 'Get the current page URL. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'reload_page',
      description: 'Reload the current page. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle'],
            description: 'When to consider navigation complete'
          }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'go_back',
      description: 'Navigate back in browser history. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'go_forward',
      description: 'Navigate forward in browser history. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'wait_for_timeout',
      description: 'Wait for a specified duration.',
      inputSchema: {
        type: 'object',
        properties: {
          ms: { type: 'number', description: 'Milliseconds to wait (max: 60000)' }
        },
        required: ['ms']
      }
    },
    {
      name: 'get_elements',
      description: 'Get all elements matching a selector. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          selector: { type: 'string', description: 'CSS selector' }
        },
        required: ['sessionId', 'selector']
      }
    },
    {
      name: 'set_viewport',
      description: 'Set the browser viewport size. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          width: { type: 'number', description: 'Viewport width' },
          height: { type: 'number', description: 'Viewport height' }
        },
        required: ['sessionId', 'width', 'height']
      }
    },
    {
      name: 'clear_cookies',
      description: 'Clear all browser cookies. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'get_cookies',
      description: 'Get all browser cookies. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' }
        },
        required: ['sessionId']
      }
    },
    {
      name: 'set_cookies',
      description: 'Set browser cookies. Requires active session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID from open_browser' },
          cookies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'string' },
                domain: { type: 'string' },
                path: { type: 'string' }
              }
            }
          }
        },
        required: ['sessionId', 'cookies']
      }
    },
    {
      name: 'get_active_sessions',
      description:
        'Get list of active browser sessions. Utility tool for multi-agent coordination.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    ...getEmulatorTools(),
    ...getFeedbackTools(),
    ...getChatTools()
  ];

  return baseTools;
}

export function getToolHandler(name) {
  return toolHandlers[name];
}
