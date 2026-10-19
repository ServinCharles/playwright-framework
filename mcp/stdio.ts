/**
 * Starts the MCP server over stdio so an AI assistant (Claude Desktop, Claude Code, Cursor)
 * can use it. See .mcp.json.example.   npm run mcp
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server';

async function main(): Promise<void> {
  await createMcpServer().connect(new StdioServerTransport());
  // stdout is the protocol channel, so logs must go to stderr
  console.error('playwright-ai-framework MCP server running on stdio');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
