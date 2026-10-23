import http from 'http';
import { randomUUID } from 'crypto';
import { createLlmClient } from '../ai/llm/factory';
import {
  AgentChatRequestSchema,
  ApprovalRequestSchema,
  AgentResponseSchema,
  type AgentResponse,
} from './contract';
import { fakePlanner } from './fake-planner';
import { buildAgent, type Agent, type AgentResult } from './graph';
import { isAuthorised } from '../auth/api-key';

const MAX_BODY_BYTES = 10_000;

function send(res: http.ServerResponse, status: number, body: unknown, requestId: string): void {
  res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': requestId });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > MAX_BODY_BYTES) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Body must be valid JSON'));
      }
    });
  });
}

function toResponse(result: AgentResult, requestId: string): AgentResponse {
  return AgentResponseSchema.parse({
    reply: result.reply,
    intent: result.intent,
    escalated: result.escalated,
    requestId,
    toolsUsed: result.toolsUsed,
    pendingApproval: result.pendingApproval,
  });
}

/**
 * HTTP wrapper for the agent.
 *   POST /chat           {message}                  -> answer, or pendingApproval
 *   POST /chat/approve   {approvalId, approved}     -> the final answer
 * Approvals belong to the person or system that runs the agent. In production put real
 * authentication in front of /chat/approve, or the model's "human" is just anyone.
 */
export function buildAgentServer(agent: Agent, options: { apiKey?: string } = {}): http.Server {
  return http.createServer(async (req, res) => {
    const requestId = randomUUID();

    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { status: 'ok', service: 'agent' }, requestId);
    }
    if (req.url !== '/chat' && req.url !== '/chat/approve') {
      return send(res, 404, { error: 'Not found' }, requestId);
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      return send(res, 405, { error: 'Method not allowed' }, requestId);
    }
    if (!isAuthorised(req.headers, options.apiKey)) {
      return send(res, 401, { error: 'Missing or wrong API key' }, requestId);
    }

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      if ((error as Error).message === 'too large') return;
      return send(res, 400, { error: (error as Error).message }, requestId);
    }

    try {
      if (req.url === '/chat') {
        const parsed = AgentChatRequestSchema.safeParse(body);
        if (!parsed.success) {
          return send(
            res,
            400,
            { error: 'message must be a non-empty string up to 2000 characters' },
            requestId,
          );
        }
        const result = await agent.start(parsed.data.message, parsed.data.sessionId);
        return send(res, 200, toResponse(result, requestId), requestId);
      }

      const parsed = ApprovalRequestSchema.safeParse(body);
      if (!parsed.success) {
        return send(
          res,
          400,
          { error: 'approvalId and approved (boolean) are required' },
          requestId,
        );
      }
      try {
        const result = await agent.resume(parsed.data.approvalId, parsed.data.approved);
        return send(res, 200, toResponse(result, requestId), requestId);
      } catch {
        return send(res, 409, { error: 'Nothing is waiting for that approval' }, requestId);
      }
    } catch {
      return send(res, 500, { error: 'Internal error' }, requestId);
    }
  });
}

if (require.main === module) {
  const llm = createLlmClient();
  const agent = buildAgent({ llm: llm ?? fakePlanner('good') });
  console.log(
    llm
      ? `Agent using ${llm.name}`
      : 'Agent using the scripted fake planner (no ANTHROPIC_API_KEY)',
  );
  const port = Number(process.env.PORT ?? 3102);
  buildAgentServer(agent, { apiKey: process.env.SERVICE_API_KEY || undefined }).listen(port, () => {
    console.log(`Agent service listening on http://localhost:${port}`);
  });
}
