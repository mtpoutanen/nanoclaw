import { createServer, IncomingMessage, ServerResponse } from 'http';

import { NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';

export function startHttpApi(
  port: number,
  token: string,
  onMessage: (chatJid: string, msg: NewMessage) => void,
  getRegisteredGroups: () => Record<string, RegisteredGroup>,
): void {
  const server = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST' || req.url !== '/message') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      const auth = req.headers['authorization'];
      if (!token || auth !== `Bearer ${token}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        let body: { text?: string; group?: string };
        try {
          body = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
          return;
        }

        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing text' }));
          return;
        }

        const groups = getRegisteredGroups();
        let targetJid: string | undefined;

        if (body.group) {
          targetJid = Object.keys(groups).find(
            (jid) => groups[jid].folder === body.group,
          );
        } else {
          // Default to main group
          targetJid = Object.keys(groups).find((jid) => groups[jid].isMain);
        }

        if (!targetJid) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No matching group found' }));
          return;
        }

        const msg: NewMessage = {
          id: `http-${Date.now()}`,
          chat_jid: targetJid,
          sender: 'http-api',
          sender_name: 'Siri',
          content: text,
          timestamp: new Date().toISOString(),
          is_from_me: false,
        };

        onMessage(targetJid, msg);
        logger.info({ targetJid, length: text.length }, 'HTTP API message queued');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'queued' }));
      });
    },
  );

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port }, 'HTTP API started');
  });
}
