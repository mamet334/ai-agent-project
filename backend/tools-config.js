// tools-config.js
// Konfigurasi lengkap tools untuk AI Agent
// Edit file ini untuk menambah/mengubah tools sesuai kebutuhan

export const TOOLS_CONFIG = {
  // ===== WEB SEARCH TOOL =====
  web_search: {
    enabled: true,
    name: 'Web Search',
    description: 'Search and retrieve information from the web',
    icon: 'Zap',
    category: 'research',
    config: {
      provider: 'google', // 'google', 'bing', 'duckduckgo'
      apiKey: process.env.SEARCH_API_KEY,
      maxResults: 10,
      timeout: 30000,
    },
    permissions: ['read'],
    rateLimit: {
      maxPerMinute: 60,
      maxPerDay: 1000,
    },
  },

  // ===== CODE EXECUTOR TOOL =====
  code_executor: {
    enabled: true,
    name: 'Code Executor',
    description: 'Execute and analyze code snippets',
    icon: 'Code2',
    category: 'compute',
    config: {
      languages: ['javascript', 'python', 'bash'],
      sandbox: true,
      timeout: 30000,
      memoryLimit: 512, // MB
      allowedModules: [
        'lodash',
        'axios',
        'moment',
        'numeral',
        'cheerio',
      ],
    },
    permissions: ['execute', 'read'],
    restrictions: {
      blockFileSystem: true,
      blockNetworkRequests: false,
      blockProcessSpawn: true,
    },
    rateLimit: {
      maxPerMinute: 10,
      maxPerDay: 100,
    },
  },

  // ===== API CALLER TOOL =====
  api_caller: {
    enabled: true,
    name: 'API Caller',
    description: 'Call and integrate with external APIs',
    icon: 'GitBranch',
    category: 'integration',
    config: {
      supportedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      timeout: 30000,
      maxRetries: 3,
      followRedirects: true,
      validateSSL: true,
    },
    permissions: ['read', 'write'],
    allowedDomains: [
      'api.github.com',
      'api.slack.com',
      'api.openai.com',
      'api.anthropic.com',
      'graph.microsoft.com',
      '*.stripe.com',
      '*.shopify.com',
    ],
    blockedDomains: [
      'localhost',
      '127.0.0.1',
      '192.168.*',
      '10.0.*',
    ],
    rateLimit: {
      maxPerMinute: 30,
      maxPerDay: 500,
    },
  },

  // ===== SLACK INTEGRATION TOOL =====
  slack_integration: {
    enabled: true,
    name: 'Slack Integration',
    description: 'Send messages and manage Slack workspace',
    icon: 'MessageCircle',
    category: 'communication',
    config: {
      botToken: process.env.SLACK_BOT_TOKEN,
      appToken: process.env.SLACK_APP_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      workspace: process.env.SLACK_WORKSPACE,
    },
    actions: {
      send_message: {
        enabled: true,
        description: 'Send a message to a Slack channel',
        requiredParams: ['channelId', 'message'],
        rateLimit: 60, // per minute
      },
      get_user_info: {
        enabled: true,
        description: 'Get information about a Slack user',
        requiredParams: ['userId'],
        rateLimit: 120,
      },
      create_channel: {
        enabled: true,
        description: 'Create a new Slack channel',
        requiredParams: ['channelName'],
        rateLimit: 5,
      },
      post_thread: {
        enabled: true,
        description: 'Post a message in a thread',
        requiredParams: ['channelId', 'threadTs', 'message'],
        rateLimit: 60,
      },
      get_channel_history: {
        enabled: true,
        description: 'Retrieve message history from a channel',
        requiredParams: ['channelId'],
        rateLimit: 30,
      },
    },
    permissions: ['read', 'write'],
    rateLimit: {
      maxPerMinute: 300,
      maxPerDay: 10000,
    },
  },

  // ===== DATABASE TOOL =====
  database: {
    enabled: true,
    name: 'Database Query',
    description: 'Query and manipulate database records',
    icon: 'Database',
    category: 'data',
    config: {
      type: 'postgresql', // 'postgresql', 'mongodb', 'mysql'
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    },
    allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
    blockedOperations: ['DROP', 'TRUNCATE', 'ALTER'],
    allowedTables: [
      'users',
      'messages',
      'logs',
      'analytics',
    ],
    permissions: ['read', 'write'],
    rateLimit: {
      maxPerMinute: 100,
      maxPerDay: 5000,
    },
  },

  // ===== EMAIL TOOL =====
  email: {
    enabled: false, // Disable by default for security
    name: 'Email Sender',
    description: 'Send emails via SMTP',
    icon: 'Mail',
    category: 'communication',
    config: {
      provider: 'smtp', // 'smtp', 'sendgrid', 'mailgun'
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
    restrictions: {
      allowedRecipients: [], // Whitelist specific emails
      maxRecipientsPerMessage: 1,
      blockAttachments: true,
    },
    permissions: ['write'],
    rateLimit: {
      maxPerMinute: 5,
      maxPerDay: 100,
    },
  },

  // ===== FILE SYSTEM TOOL =====
  file_system: {
    enabled: false, // Disable by default for security
    name: 'File System',
    description: 'Read and write files',
    icon: 'FileText',
    category: 'data',
    config: {
      rootDir: '/app/safe-files',
      maxFileSize: 10 * 1024 * 1024, // 10 MB
    },
    allowedPaths: [
      '/app/safe-files/*',
      '/app/uploads/*',
    ],
    blockedPaths: [
      '/etc/*',
      '/root/*',
      '/var/*',
      '/proc/*',
    ],
    permissions: ['read', 'write'],
    rateLimit: {
      maxPerMinute: 30,
      maxPerDay: 1000,
    },
  },

  // ===== CUSTOM API TOOL =====
  custom_api: {
    enabled: true,
    name: 'Custom API',
    description: 'Call your custom internal API',
    icon: 'Zap',
    category: 'integration',
    config: {
      baseUrl: process.env.CUSTOM_API_BASE_URL,
      apiKey: process.env.CUSTOM_API_KEY,
      timeout: 30000,
    },
    endpoints: [
      {
        name: 'create_order',
        method: 'POST',
        path: '/orders',
        description: 'Create a new order',
      },
      {
        name: 'get_user_profile',
        method: 'GET',
        path: '/users/:id',
        description: 'Get user profile information',
      },
      {
        name: 'update_inventory',
        method: 'PATCH',
        path: '/inventory/:id',
        description: 'Update product inventory',
      },
    ],
    permissions: ['read', 'write'],
    rateLimit: {
      maxPerMinute: 120,
      maxPerDay: 5000,
    },
  },
};

// ===== TOOL MANAGER =====
export class ToolManager {
  constructor(config = TOOLS_CONFIG) {
    this.config = config;
    this.rateLimitTrackers = {};
    this.initializeRateLimiters();
  }

  /**
   * Get all enabled tools
   */
  getEnabledTools() {
    return Object.entries(this.config)
      .filter(([_, toolConfig]) => toolConfig.enabled)
      .map(([toolId, toolConfig]) => ({
        id: toolId,
        name: toolConfig.name,
        description: toolConfig.description,
        category: toolConfig.category,
      }));
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category) {
    return this.getEnabledTools().filter(
      tool => this.config[tool.id].category === category
    );
  }

  /**
   * Check if tool is available for user
   */
  isToolAvailable(toolId, userId) {
    const tool = this.config[toolId];
    if (!tool || !tool.enabled) {
      return false;
    }

    // Check rate limit
    return this.checkRateLimit(toolId, userId);
  }

  /**
   * Initialize rate limiters
   */
  initializeRateLimiters() {
    Object.entries(this.config).forEach(([toolId, toolConfig]) => {
      if (toolConfig.rateLimit) {
        this.rateLimitTrackers[toolId] = new Map();
      }
    });
  }

  /**
   * Check and enforce rate limits
   */
  checkRateLimit(toolId, userId) {
    const tool = this.config[toolId];
    if (!tool.rateLimit) return true;

    const key = `${userId}_${toolId}`;
    let tracker = this.rateLimitTrackers[toolId].get(key) || {
      requests: 0,
      lastReset: Date.now(),
    };

    const now = Date.now();
    const oneMinute = 60 * 1000;

    // Reset per minute counter
    if (now - tracker.lastReset > oneMinute) {
      tracker.requests = 0;
      tracker.lastReset = now;
    }

    // Check limit
    if (tracker.requests >= tool.rateLimit.maxPerMinute) {
      return false;
    }

    tracker.requests++;
    this.rateLimitTrackers[toolId].set(key, tracker);
    return true;
  }

  /**
   * Get tool configuration
   */
  getToolConfig(toolId) {
    return this.config[toolId];
  }

  /**
   * Validate tool request
   */
  validateToolRequest(toolId, params, userId) {
    const tool = this.config[toolId];

    if (!tool || !tool.enabled) {
      throw new Error(`Tool ${toolId} is not available`);
    }

    if (!this.checkRateLimit(toolId, userId)) {
      throw new Error(
        `Rate limit exceeded for tool ${toolId}`
      );
    }

    // Tool-specific validation
    if (toolId === 'api_caller') {
      this.validateApiCall(params, tool);
    }

    if (toolId === 'code_executor') {
      this.validateCodeExecution(params, tool);
    }

    return true;
  }

  /**
   * Validate API call parameters
   */
  validateApiCall(params, tool) {
    const { url, method } = params;

    // Check method
    if (!tool.config.supportedMethods.includes(method)) {
      throw new Error(`Method ${method} not allowed`);
    }

    // Check domain whitelist/blacklist
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Check if domain is blocked
      if (tool.blockedDomains) {
        for (const blockedDomain of tool.blockedDomains) {
          if (
            blockedDomain.startsWith('*') &&
            domain.endsWith(blockedDomain.slice(1))
          ) {
            throw new Error(`Domain ${domain} is blocked`);
          }
          if (domain === blockedDomain) {
            throw new Error(`Domain ${domain} is blocked`);
          }
        }
      }

      // Check if domain is in whitelist (if whitelist exists)
      if (tool.allowedDomains && tool.allowedDomains.length > 0) {
        const isAllowed = tool.allowedDomains.some(allowedDomain => {
          if (allowedDomain === '*') return true;
          if (allowedDomain.startsWith('*.')) {
            return domain.endsWith(allowedDomain.slice(2));
          }
          return domain === allowedDomain;
        });

        if (!isAllowed) {
          throw new Error(`Domain ${domain} is not allowed`);
        }
      }
    } catch (error) {
      if (error.message.includes('not allowed') || error.message.includes('is blocked')) {
        throw error;
      }
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * Validate code execution parameters
   */
  validateCodeExecution(params, tool) {
    const { language, code } = params;

    if (!tool.config.languages.includes(language)) {
      throw new Error(`Language ${language} is not supported`);
    }

    // Check for dangerous code patterns
    const dangerousPatterns = [
      /rm\s+(-rf|-f|--force)?\s+\//,
      /sudo/,
      /eval\s*\(/,
      /exec\s*\(/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error('Code contains potentially dangerous operations');
      }
    }

    if (code.length > 10000) {
      throw new Error('Code exceeds maximum length (10000 characters)');
    }
  }
}

export default ToolManager;
