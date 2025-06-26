#!/usr/bin/env node

/**
 * SeedDream 3.0 Replicate MCP Server
 * 
 * This MCP server provides image generation capabilities using Bytedance's SeedDream 3.0 model
 * via the Replicate platform. SeedDream 3.0 is a bilingual (Chinese and English) text-to-image 
 * model that excels at:
 * 
 * - Native 2K high resolution output with various aspect ratios
 * - Exceptional text layout for visually stunning results
 * - Accurate small and large text generation
 * - Photorealistic portraits with cinematic beauty
 * - Fast generation (3 seconds for 1K images)
 * - Strong instruction following and enhanced aesthetics
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Replicate from "replicate";
import { writeFile } from "fs/promises";
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

// Get Replicate API token from environment variable
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const NODE_ENV = process.env.NODE_ENV || 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS || '3');
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '300000');

let replicate: Replicate | null = null;

// Enhanced logging
function log(level: string, message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
  const currentLevel = logLevels[LOG_LEVEL as keyof typeof logLevels] || 2;
  const messageLevel = logLevels[level as keyof typeof logLevels] || 0;
  
  if (messageLevel <= currentLevel) {
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (data) {
      console.error(`${prefix} ${message}`, data);
    } else {
      console.error(`${prefix} ${message}`);
    }
  }
}

if (!REPLICATE_API_TOKEN) {
  log('error', "REPLICATE_API_TOKEN environment variable is required");
  log('info', "Please set your Replicate API token: export REPLICATE_API_TOKEN=r8_your_token_here");
  log('info', "Get your token from: https://replicate.com/account");
  // Server continues running, no process.exit()
} else {
  // Validate token format
  if (!REPLICATE_API_TOKEN.startsWith('r8_')) {
    log('warn', "API token format may be invalid - should start with 'r8_'");
  }
  
  // Configure Replicate client
  replicate = new Replicate({
    auth: REPLICATE_API_TOKEN,
  });
  
  log('info', "Replicate client initialized successfully");
  log('debug', "Configuration", {
    nodeEnv: NODE_ENV,
    logLevel: LOG_LEVEL,
    maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
    requestTimeout: REQUEST_TIMEOUT
  });
}

// Valid aspect ratios for SeedDream 3.0 via Replicate
const VALID_ASPECT_RATIOS = [
  "1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9", "custom"
] as const;

type AspectRatio = typeof VALID_ASPECT_RATIOS[number];

// Valid sizes for SeedDream 3.0 via Replicate
const VALID_SIZES = ["small", "regular", "big"] as const;
type Size = typeof VALID_SIZES[number];

/**
 * Interface for SeedDream 3.0 generation parameters via Replicate
 */
interface SeedDreamParams {
  prompt: string;
  aspect_ratio?: AspectRatio;
  size?: Size;
  width?: number;
  height?: number;
  guidance_scale?: number;
  seed?: number;
}

/**
 * Interface for SeedDream 3.0 API response from Replicate
 */
interface SeedDreamResponse {
  url?: string;
  urls?: string[];
}

/**
 * Download an image from a URL and save it locally
 */
async function downloadImage(url: string, filename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    // Create images directory if it doesn't exist
    const imagesDir = path.join(process.cwd(), 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    const filePath = path.join(imagesDir, filename);
    const file = fs.createWriteStream(filePath);
    
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve(filePath);
      });
      
      file.on('error', (err) => {
        fs.unlink(filePath, () => {}); // Delete the file on error
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Generate a unique filename for an image
 */
function generateImageFilename(prompt: string, index: number, seed: number): string {
  // Create a safe filename from the prompt
  const safePrompt = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `seedream_${safePrompt}_${seed}_${index}_${timestamp}.png`;
}

/**
 * Create an MCP server with image generation capabilities
 */
const server = new Server(
  {
    name: "seedream-replicate-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists available tools for image generation
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_image",
        description: "Generate images using Bytedance's SeedDream 3.0 model via Replicate. Supports bilingual prompts (Chinese and English), high-resolution output, and various aspect ratios.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The text prompt used to generate the image. Supports both English and Chinese. Be descriptive for best results."
            },
            aspect_ratio: {
              type: "string",
              enum: VALID_ASPECT_RATIOS,
              description: "Image aspect ratio. Set to 'custom' to specify width and height.",
              default: "16:9"
            },
            size: {
              type: "string",
              enum: VALID_SIZES,
              description: "Big images will have their longest dimension be 2048px. Small images will have their shortest dimension be 512px. Regular images will always be 1 megapixel. Ignored if aspect ratio is custom.",
              default: "regular"
            },
            width: {
              type: "integer",
              description: "Image width (only used when aspect_ratio is 'custom')",
              minimum: 512,
              maximum: 2048,
              default: 2048
            },
            height: {
              type: "integer",
              description: "Image height (only used when aspect_ratio is 'custom')",
              minimum: 512,
              maximum: 2048,
              default: 2048
            },
            guidance_scale: {
              type: "number",
              description: "Prompt adherence. Higher = more literal.",
              minimum: 1.0,
              maximum: 10.0,
              default: 2.5
            },
            seed: {
              type: "integer",
              description: "Random seed to control the stochasticity of image generation. Use the same seed for reproducible results.",
              minimum: 0,
              maximum: 2147483647
            }
          },
          required: ["prompt"]
        }
      }
    ]
  };
});

/**
 * Handler for tool execution
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "generate_image": {
      try {
        if (!replicate) {
          return {
            content: [{
              type: "text",
              text: "Error: REPLICATE_API_TOKEN environment variable is not set. Please configure your Replicate API token."
            }],
            isError: true
          };
        }

        const params = (request.params.arguments || {}) as unknown as SeedDreamParams;
        
        if (!params.prompt || typeof params.prompt !== 'string') {
          throw new Error("Prompt is required and must be a string");
        }

        // Validate aspect ratio if provided
        if (params.aspect_ratio && !VALID_ASPECT_RATIOS.includes(params.aspect_ratio)) {
          throw new Error(`Invalid aspect ratio. Must be one of: ${VALID_ASPECT_RATIOS.join(', ')}`);
        }

        // Validate size if provided
        if (params.size && !VALID_SIZES.includes(params.size)) {
          throw new Error(`Invalid size. Must be one of: ${VALID_SIZES.join(', ')}`);
        }

        // Prepare the input payload for Replicate
        const input: any = {
          prompt: params.prompt,
          aspect_ratio: params.aspect_ratio || "16:9",
          guidance_scale: params.guidance_scale || 2.5
        };

        // Add size if not using custom aspect ratio
        if (params.aspect_ratio !== "custom") {
          input.size = params.size || "regular";
        }

        // Add custom dimensions if aspect ratio is custom
        if (params.aspect_ratio === "custom") {
          input.width = params.width || 2048;
          input.height = params.height || 2048;
        }

        if (params.seed !== undefined) {
          input.seed = params.seed;
        }

        log('info', `Generating image with prompt: "${params.prompt}"`);
        log('debug', 'Generation parameters', input);
        
        const startTime = Date.now();
        
        try {
          // Call the SeedDream 3.0 model on Replicate with timeout
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT);
          });
          
          const generationPromise = replicate.run("bytedance/seedream-3", { input }) as Promise<unknown>;
          
          const rawOutput = await Promise.race([generationPromise, timeoutPromise]);
          const output = rawOutput as string;
          
          const generationTime = Date.now() - startTime;
          log('info', `Image generated successfully in ${generationTime}ms`);

          if (!output) {
            throw new Error("No image was generated - empty response from Replicate");
          }

          if (typeof output !== 'string' || !output.startsWith('http')) {
            throw new Error(`Invalid response format from Replicate: ${typeof output}`);
          }

          // Download image locally
          log('debug', "Downloading image locally...");
          const filename = generateImageFilename(params.prompt, 1, input.seed || Math.floor(Math.random() * 1000000));
          
          try {
            const localPath = await downloadImage(output, filename);
            log('info', `Image downloaded successfully: ${filename}`);

            return {
              content: [
                {
                  type: "text",
                  text: `✅ Successfully generated image using SeedDream 3.0:

📝 **Generation Details:**
• Prompt: "${params.prompt}"
• Aspect Ratio: ${input.aspect_ratio}
• ${input.size ? `Size: ${input.size}` : `Dimensions: ${input.width}x${input.height}`}
• Guidance Scale: ${input.guidance_scale}
• ${input.seed ? `Seed: ${input.seed}` : 'Seed: Random'}
• Generation Time: ${generationTime}ms

🖼️ **Generated Image:**
• Local Path: ${localPath}
• Original URL: ${output}

💾 The image has been downloaded to the local 'images' directory.`
                }
              ]
            };
          } catch (downloadError) {
            log('warn', `Failed to download image: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`);
            return {
              content: [
                {
                  type: "text",
                  text: `✅ Successfully generated image using SeedDream 3.0:

📝 **Generation Details:**
• Prompt: "${params.prompt}"
• Aspect Ratio: ${input.aspect_ratio}
• ${input.size ? `Size: ${input.size}` : `Dimensions: ${input.width}x${input.height}`}
• Guidance Scale: ${input.guidance_scale}
• ${input.seed ? `Seed: ${input.seed}` : 'Seed: Random'}
• Generation Time: ${generationTime}ms

🖼️ **Generated Image:**
• Download Failed: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}
• Original URL: ${output}

🌐 You can access the image directly at the URL above.`
                }
              ]
            };
          }
        } catch (apiError) {
          const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown API error';
          log('error', `Replicate API error: ${errorMessage}`);
          
          // Provide helpful error messages based on common issues
          let helpfulMessage = '';
          if (errorMessage.includes('timeout')) {
            helpfulMessage = '\n💡 **Tip:** Try a simpler prompt or increase the timeout setting.';
          } else if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
            helpfulMessage = '\n💡 **Tip:** Check your REPLICATE_API_TOKEN is valid and has sufficient credits.';
          } else if (errorMessage.includes('rate limit')) {
            helpfulMessage = '\n💡 **Tip:** You\'ve hit the rate limit. Please wait a moment before trying again.';
          }
          
          throw new Error(`Failed to generate image: ${errorMessage}${helpfulMessage}`);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        log('error', `Image generation failed: ${errorMessage}`);
        
        return {
          content: [
            {
              type: "text",
              text: `❌ **Error generating image:**

${errorMessage}

🔧 **Troubleshooting:**
• Verify your REPLICATE_API_TOKEN is set and valid
• Check your internet connection
• Ensure your Replicate account has sufficient credits
• Try a simpler prompt if the error persists

📞 **Need help?** Visit: https://github.com/PierrunoYT/seedream-v3-replicate-mcp-server/issues`
            }
          ],
          isError: true
        };
      }
    }

    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }
});

/**
 * Start the server using stdio transport
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('info', "SeedDream 3.0 Replicate MCP server running on stdio");
  log('debug', "Server ready to accept requests");
}

// Graceful shutdown handlers
process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Unhandled rejection at:', { promise, reason });
  process.exit(1);
});

main().catch((error) => {
  log('error', "Server startup error:", error);
  process.exit(1);
});
