#!/usr/bin/env node

/**
 * Comprehensive Test Server for SeedDream 3.0 Replicate MCP Server
 *
 * Features:
 * - Complete MCP server testing
 * - Error handling and logging
 * - Mock data endpoints
 * - Configuration integration
 * - Health checks and monitoring
 * - Performance benchmarking
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure logs directory exists
const logsDir = join(__dirname, '../logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Load configuration if available
let config = null;
try {
  const configPath = join(__dirname, '../config/server.config.json');
  if (existsSync(configPath)) {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  }
} catch (error) {
  console.warn('⚠️  Configuration file not found, using defaults');
}

// Logger utility
class Logger {
  static log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(data && { data })
    };
    
    const colorMap = {
      info: '\x1b[36m',    // cyan
      warn: '\x1b[33m',    // yellow
      error: '\x1b[31m',   // red
      success: '\x1b[32m', // green
      debug: '\x1b[90m'    // gray
    };
    
    const color = colorMap[level] || '\x1b[0m';
    const reset = '\x1b[0m';
    
    console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${reset}`);
    if (data) {
      console.log(`${color}${JSON.stringify(data, null, 2)}${reset}`);
    }
  }
  
  static info(message, data) { this.log('info', message, data); }
  static warn(message, data) { this.log('warn', message, data); }
  static error(message, data) { this.log('error', message, data); }
  static success(message, data) { this.log('success', message, data); }
  static debug(message, data) { this.log('debug', message, data); }
}

// Mock data for testing
const mockData = {
  responses: {
    success: {
      url: "https://replicate.delivery/pbxt/mock-image-url.jpg",
      width: 1024,
      height: 1024
    },
    error: {
      message: "Mock generation failed for testing",
      code: "MOCK_ERROR"
    }
  },
  prompts: [
    "a cute robot in a garden",
    "a majestic mountain landscape at sunset",
    "a futuristic cityscape with flying cars",
    "a serene lake with cherry blossoms"
  ]
};

// Test scenarios
const testScenarios = {
  basic: [
    {
      name: "List Tools",
      message: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
      }
    }
  ],
  
  generation: [
    {
      name: "Basic Image Generation",
      message: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "generate_image",
          arguments: {
            prompt: mockData.prompts[0],
            aspect_ratio: "1:1",
            guidance_scale: 2.5
          }
        }
      }
    },
    {
      name: "Custom Dimensions",
      message: {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "generate_image",
          arguments: {
            prompt: mockData.prompts[1],
            aspect_ratio: "custom",
            width: 1024,
            height: 768,
            guidance_scale: 3.0,
            seed: 12345
          }
        }
      }
    }
  ],
  
  validation: [
    {
      name: "Invalid Aspect Ratio",
      message: {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "generate_image",
          arguments: {
            prompt: "test prompt",
            aspect_ratio: "invalid_ratio"
          }
        }
      }
    },
    {
      name: "Missing Prompt",
      message: {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "generate_image",
          arguments: {
            aspect_ratio: "1:1"
          }
        }
      }
    }
  ]
};

// Test runner class
class TestRunner {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
    this.server = null;
    this.responses = [];
    this.expectedResponses = 0;
  }

  async runTests(scenario = 'basic') {
    Logger.info(`🚀 Starting SeedDream 3.0 Replicate MCP Server Tests`);
    Logger.info(`📋 Test Scenario: ${scenario}`);
    
    if (config) {
      Logger.info(`⚙️  Using configuration from: config/server.config.json`);
    }

    // Check if build exists
    const serverPath = join(__dirname, 'build', 'index.js');
    if (!existsSync(serverPath)) {
      Logger.error('❌ Build file not found!');
      Logger.info('💡 Run: npm run build');
      process.exit(1);
    }

    const testMessages = this.getTestMessages(scenario);
    this.expectedResponses = testMessages.length;

    try {
      await this.startServer(serverPath);
      await this.sendTestMessages(testMessages);
      await this.waitForCompletion();
      this.analyzeResults();
    } catch (error) {
      Logger.error('❌ Test execution failed:', { error: error.message });
      process.exit(1);
    }
  }

  getTestMessages(scenario) {
    const scenarios = testScenarios[scenario];
    if (!scenarios) {
      Logger.warn(`⚠️  Unknown scenario '${scenario}', using 'basic'`);
      return testScenarios.basic;
    }
    return scenarios;
  }

  async startServer(serverPath) {
    return new Promise((resolve, reject) => {
      Logger.info('🔄 Starting MCP server...');
      
      this.server = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || 'test-token-for-listing-tools',
          NODE_ENV: 'test'
        }
      });

      // Handle server output
      this.server.stdout.on('data', (data) => {
        this.handleServerOutput(data);
      });

      // Handle server errors and startup
      this.server.stderr.on('data', (data) => {
        const message = data.toString();
        if (message.includes('running on stdio')) {
          Logger.success('✅ Server started successfully');
          resolve();
        } else if (message.includes('Error:')) {
          Logger.error('Server error:', { message: message.trim() });
        } else if (!message.includes('SeedDream')) {
          Logger.debug('Server stderr:', { message: message.trim() });
        }
      });

      // Handle server startup errors
      this.server.on('error', (error) => {
        Logger.error('❌ Failed to start server:', { error: error.message });
        if (error.code === 'ENOENT') {
          Logger.info('💡 Make sure to build the server first: npm run build');
        }
        reject(error);
      });

      // Timeout for server startup
      setTimeout(() => {
        if (!this.server.killed) {
          reject(new Error('Server startup timeout'));
        }
      }, 10000);
    });
  }

  handleServerOutput(data) {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      try {
        const response = JSON.parse(line);
        this.responses.push({
          ...response,
          receivedAt: Date.now()
        });
        
        Logger.info(`📨 Response ${this.responses.length}:`, response);
        
        // Check if we've received all expected responses
        if (this.responses.length >= this.expectedResponses) {
          setTimeout(() => this.server.kill(), 100);
        }
      } catch (e) {
        // Ignore non-JSON output
        Logger.debug('Non-JSON output:', { line });
      }
    });
  }

  async sendTestMessages(testMessages) {
    Logger.info(`📤 Sending ${testMessages.length} test message(s)...`);
    
    testMessages.forEach((test, index) => {
      Logger.info(`🔸 Test ${index + 1}: ${test.name}`);
      Logger.debug('Message:', test.message);
      
      this.server.stdin.write(JSON.stringify(test.message) + '\n');
    });
  }

  async waitForCompletion() {
    return new Promise((resolve) => {
      this.server.on('close', (code) => {
        Logger.info(`🏁 Server exited with code ${code}`);
        resolve();
      });

      // Fallback timeout
      setTimeout(() => {
        if (!this.server.killed) {
          Logger.warn('⏰ Test timeout - killing server');
          this.server.kill();
        }
      }, 15000);
    });
  }

  analyzeResults() {
    const duration = Date.now() - this.startTime;
    Logger.info(`⏱️  Test Duration: ${duration}ms`);
    
    if (this.responses.length === 0) {
      Logger.error('❌ No responses received from server');
      return;
    }

    Logger.success(`✅ Test completed! Received ${this.responses.length} response(s)`);
    
    // Analyze tool listing
    const toolsResponse = this.responses.find(r => r.result && r.result.tools);
    if (toolsResponse) {
      const tools = toolsResponse.result.tools;
      Logger.success(`📋 Available tools: ${tools.map(t => t.name).join(', ')}`);
      
      // Validate tool schemas
      tools.forEach(tool => {
        if (tool.inputSchema && tool.inputSchema.properties) {
          Logger.info(`🔧 Tool '${tool.name}' parameters:`,
            Object.keys(tool.inputSchema.properties));
        }
      });
    }

    // Analyze errors
    const errors = this.responses.filter(r => r.error || r.isError);
    if (errors.length > 0) {
      Logger.warn(`⚠️  Found ${errors.length} error response(s):`);
      errors.forEach((error, index) => {
        Logger.error(`Error ${index + 1}:`, error);
      });
    }

    // Performance metrics
    const avgResponseTime = this.responses.length > 1 ?
      (this.responses[this.responses.length - 1].receivedAt - this.startTime) / this.responses.length : 0;
    
    Logger.info('📊 Performance Metrics:', {
      totalResponses: this.responses.length,
      averageResponseTime: `${avgResponseTime.toFixed(2)}ms`,
      successRate: `${((this.responses.length - errors.length) / this.responses.length * 100).toFixed(1)}%`
    });
  }
}

// Health check function
async function healthCheck() {
  Logger.info('🏥 Running health check...');
  
  const checks = {
    buildExists: existsSync(join(__dirname, 'build', 'index.js')),
    configExists: existsSync(join(__dirname, '../config/server.config.json')),
    logsDirectory: existsSync(join(__dirname, '../logs')),
    replicateToken: !!process.env.REPLICATE_API_TOKEN
  };
  
  Logger.info('Health Check Results:', checks);
  
  const allPassed = Object.values(checks).every(check => check);
  if (allPassed) {
    Logger.success('✅ All health checks passed');
  } else {
    Logger.warn('⚠️  Some health checks failed');
  }
  
  return allPassed;
}

// Main test function
async function runTests() {
  const args = process.argv.slice(2);
  const scenario = args[0] || 'basic';
  const command = args.includes('--health-check') ? 'health' : 'test';
  
  try {
    if (command === 'health') {
      await healthCheck();
      return;
    }
    
    const runner = new TestRunner();
    await runner.runTests(scenario);
    
  } catch (error) {
    Logger.error('❌ Test execution failed:', { error: error.message });
    process.exit(1);
  }
}

// CLI help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🧪 SeedDream 3.0 Replicate MCP Server Test Suite

Usage:
  node test-server.js [scenario] [options]

Scenarios:
  basic       - Basic functionality tests (default)
  generation  - Image generation tests
  validation  - Input validation tests

Options:
  --health-check  - Run health checks only
  --help, -h      - Show this help message

Examples:
  node test-server.js basic
  node test-server.js generation
  node test-server.js --health-check

Environment Variables:
  REPLICATE_API_TOKEN - Your Replicate API token (required for generation tests)
  NODE_ENV           - Environment mode (test, development, production)
`);
  process.exit(0);
}

// Run the tests
runTests().catch(console.error);