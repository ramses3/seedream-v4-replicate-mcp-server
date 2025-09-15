#!/usr/bin/env node
/**
 * SeedDream 4.0 Replicate MCP Server
 *
 * This MCP server provides image generation capabilities using Bytedance's SeedDream 4.0 model
 * via the Replicate platform. SeedDream 4.0 is an advanced bilingual (Chinese and English)
 * text-to-image model that excels at:
 *
 * - High resolution output up to 4K (4096px) with various aspect ratios
 * - Image-to-image generation with multi-reference support
 * - Sequential image generation for stories and character variations
 * - Exceptional text layout for visually stunning results
 * - Accurate small and large text generation
 * - Photorealistic portraits with cinematic beauty
 * - Fast generation with enhanced aesthetics
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import Replicate from "replicate";
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
let replicate = null;
// Enhanced logging
function log(level, message, data) {
    const timestamp = new Date().toISOString();
    const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
    const currentLevel = logLevels[LOG_LEVEL] || 2;
    const messageLevel = logLevels[level] || 0;
    if (messageLevel <= currentLevel) {
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        if (data) {
            console.error(`${prefix} ${message}`, data);
        }
        else {
            console.error(`${prefix} ${message}`);
        }
    }
}
if (!REPLICATE_API_TOKEN) {
    log('error', "REPLICATE_API_TOKEN environment variable is required");
    log('info', "Please set your Replicate API token: export REPLICATE_API_TOKEN=r8_your_token_here");
    log('info', "Get your token from: https://replicate.com/account");
    // Server continues running, no process.exit()
}
else {
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
// Valid sizes for SeedDream 4.0 via Replicate
const VALID_SIZES = ["1K", "2K", "4K", "custom"];
// Valid aspect ratios for SeedDream 4.0 via Replicate
const VALID_ASPECT_RATIOS = [
    "1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9", "match_input_image"
];
// Valid sequential generation modes
const VALID_SEQUENTIAL_MODES = ["disabled", "auto"];
/**
 * Download an image from a URL and save it locally
 */
async function downloadImage(url, filename) {
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
                fs.unlink(filePath, () => { }); // Delete the file on error
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
function generateImageFilename(prompt, index, timestamp) {
    // Create a safe filename from the prompt
    const safePrompt = prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
    const timeStr = timestamp || new Date().toISOString().replace(/[:.]/g, '-');
    return `seedream4_${safePrompt}_${index}_${timeStr}.jpg`;
}
/**
 * Create an MCP server with image generation capabilities
 */
const server = new Server({
    name: "seedream4-replicate-server",
    version: "0.2.0",
}, {
    capabilities: {
        tools: {},
    },
});
/**
 * Handler that lists available tools for image generation
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "generate_image",
                description: "Generate images using Bytedance's SeedDream 4.0 model via Replicate. Supports bilingual prompts (Chinese and English), high-resolution output up to 4K, image-to-image generation, and sequential image generation.",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "The text prompt used to generate the image. Supports both English and Chinese. Be descriptive for best results."
                        },
                        size: {
                            type: "string",
                            enum: VALID_SIZES,
                            description: "Image resolution: 1K (1024px), 2K (2048px), 4K (4096px), or 'custom' for specific dimensions.",
                            default: "2K"
                        },
                        width: {
                            type: "integer",
                            description: "Custom image width (only used when size='custom'). Range: 1024-4096 pixels.",
                            minimum: 1024,
                            maximum: 4096,
                            default: 2048
                        },
                        height: {
                            type: "integer",
                            description: "Custom image height (only used when size='custom'). Range: 1024-4096 pixels.",
                            minimum: 1024,
                            maximum: 4096,
                            default: 2048
                        },
                        max_images: {
                            type: "integer",
                            description: "Maximum number of images to generate when sequential_image_generation='auto'. Range: 1-15. Total images (input + generated) cannot exceed 15.",
                            minimum: 1,
                            maximum: 15,
                            default: 1
                        },
                        image_input: {
                            type: "array",
                            items: {
                                type: "string"
                            },
                            description: "Input image URLs for image-to-image generation. List of 1-10 images for single or multi-reference generation.",
                            maxItems: 10,
                            default: []
                        },
                        aspect_ratio: {
                            type: "string",
                            enum: VALID_ASPECT_RATIOS,
                            description: "Image aspect ratio. Only used when size is not 'custom'. Use 'match_input_image' to automatically match the input image's aspect ratio.",
                            default: "match_input_image"
                        },
                        sequential_image_generation: {
                            type: "string",
                            enum: VALID_SEQUENTIAL_MODES,
                            description: "Group image generation mode. 'disabled' generates a single image. 'auto' lets the model decide whether to generate multiple related images (e.g., story scenes, character variations).",
                            default: "disabled"
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
                const params = (request.params.arguments || {});
                if (!params.prompt || typeof params.prompt !== 'string') {
                    throw new Error("Prompt is required and must be a string");
                }
                // Validate size if provided
                if (params.size && !VALID_SIZES.includes(params.size)) {
                    throw new Error(`Invalid size. Must be one of: ${VALID_SIZES.join(', ')}`);
                }
                // Validate aspect ratio if provided
                if (params.aspect_ratio && !VALID_ASPECT_RATIOS.includes(params.aspect_ratio)) {
                    throw new Error(`Invalid aspect ratio. Must be one of: ${VALID_ASPECT_RATIOS.join(', ')}`);
                }
                // Validate sequential mode if provided
                if (params.sequential_image_generation && !VALID_SEQUENTIAL_MODES.includes(params.sequential_image_generation)) {
                    throw new Error(`Invalid sequential mode. Must be one of: ${VALID_SEQUENTIAL_MODES.join(', ')}`);
                }
                // Validate max_images
                if (params.max_images && (params.max_images < 1 || params.max_images > 15)) {
                    throw new Error("max_images must be between 1 and 15");
                }
                // Validate image_input array
                if (params.image_input && params.image_input.length > 10) {
                    throw new Error("image_input can contain at most 10 images");
                }
                // Validate custom dimensions
                if (params.size === "custom") {
                    if (params.width && (params.width < 1024 || params.width > 4096)) {
                        throw new Error("width must be between 1024 and 4096 when using custom size");
                    }
                    if (params.height && (params.height < 1024 || params.height > 4096)) {
                        throw new Error("height must be between 1024 and 4096 when using custom size");
                    }
                }
                // Prepare the input payload for Replicate
                const input = {
                    prompt: params.prompt,
                    size: params.size || "2K",
                    max_images: params.max_images || 1,
                    image_input: params.image_input || [],
                    aspect_ratio: params.aspect_ratio || "match_input_image",
                    sequential_image_generation: params.sequential_image_generation || "disabled"
                };
                // Add custom dimensions if using custom size
                if (params.size === "custom") {
                    input.width = params.width || 2048;
                    input.height = params.height || 2048;
                }
                log('info', `Generating image(s) with prompt: "${params.prompt}"`);
                log('debug', 'Generation parameters', input);
                const startTime = Date.now();
                try {
                    // Call the SeedDream 4.0 model on Replicate with timeout
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT);
                    });
                    const generationPromise = replicate.run("bytedance/seedream-4", { input });
                    const output = await Promise.race([generationPromise, timeoutPromise]);
                    const generationTime = Date.now() - startTime;
                    log('info', `Image(s) generated successfully in ${generationTime}ms`);
                    if (!output || !Array.isArray(output) || output.length === 0) {
                        throw new Error("No images were generated - empty response from Replicate");
                    }
                    // Download images locally
                    log('debug', `Downloading ${output.length} image(s) locally...`);
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const downloadedImages = [];
                    for (let i = 0; i < output.length; i++) {
                        const imageUrl = output[i].url();
                        if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
                            log('warn', `Invalid image URL at index ${i}: ${imageUrl}`);
                            continue;
                        }
                        try {
                            const filename = generateImageFilename(params.prompt, i, timestamp);
                            const localPath = await downloadImage(imageUrl, filename);
                            downloadedImages.push({ url: imageUrl, localPath, index: i });
                            log('info', `Image ${i + 1} downloaded successfully: ${filename}`);
                        }
                        catch (downloadError) {
                            log('warn', `Failed to download image ${i + 1}: ${downloadError instanceof Error ? downloadError.message : 'Unknown error'}`);
                            downloadedImages.push({ url: imageUrl, localPath: '', index: i });
                        }
                    }
                    // Format response
                    const imageDetails = downloadedImages.map(img => {
                        if (img.localPath) {
                            return `• Image ${img.index + 1}: ${img.localPath} (${img.url})`;
                        }
                        else {
                            return `• Image ${img.index + 1}: Download failed - ${img.url}`;
                        }
                    }).join('\n');
                    const successfulDownloads = downloadedImages.filter(img => img.localPath).length;
                    return {
                        content: [
                            {
                                type: "text",
                                text: `✅ Successfully generated ${output.length} image(s) using SeedDream 4.0:

📝 **Generation Details:**
• Prompt: "${params.prompt}"
• Size: ${input.size}${input.size === 'custom' ? ` (${input.width}x${input.height})` : ''}
• Aspect Ratio: ${input.aspect_ratio}
• Max Images: ${input.max_images}
• Sequential Generation: ${input.sequential_image_generation}
• Input Images: ${input.image_input.length}
• Generation Time: ${generationTime}ms

🖼️ **Generated Images (${output.length} total, ${successfulDownloads} downloaded):**
${imageDetails}

💾 ${successfulDownloads > 0 ? 'Images have been downloaded to the local \'images\' directory.' : 'Images are available at the URLs above.'}`
                            }
                        ]
                    };
                }
                catch (apiError) {
                    const errorMessage = apiError instanceof Error ? apiError.message : 'Unknown API error';
                    log('error', `Replicate API error: ${errorMessage}`);
                    // Provide helpful error messages based on common issues
                    let helpfulMessage = '';
                    if (errorMessage.includes('timeout')) {
                        helpfulMessage = '\n💡 **Tip:** Try a simpler prompt or increase the timeout setting.';
                    }
                    else if (errorMessage.includes('authentication') || errorMessage.includes('unauthorized')) {
                        helpfulMessage = '\n💡 **Tip:** Check your REPLICATE_API_TOKEN is valid and has sufficient credits.';
                    }
                    else if (errorMessage.includes('rate limit')) {
                        helpfulMessage = '\n💡 **Tip:** You\'ve hit the rate limit. Please wait a moment before trying again.';
                    }
                    else if (errorMessage.includes('input validation')) {
                        helpfulMessage = '\n💡 **Tip:** Check your input parameters are within valid ranges.';
                    }
                    throw new Error(`Failed to generate image(s): ${errorMessage}${helpfulMessage}`);
                }
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                log('error', `Image generation failed: ${errorMessage}`);
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ **Error generating image(s):**

${errorMessage}

🔧 **Troubleshooting:**
• Verify your REPLICATE_API_TOKEN is set and valid
• Check your internet connection
• Ensure your Replicate account has sufficient credits
• Verify input parameters are within valid ranges
• Try a simpler prompt if the error persists

📞 **Need help?** Visit: https://github.com/PierrunoYT/seedream-v4-replicate-mcp-server/issues`
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
    log('info', "SeedDream 4.0 Replicate MCP server running on stdio");
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
