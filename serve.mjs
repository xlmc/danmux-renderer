import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.DANMUX_RENDERER_PORT || 4174);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
  // 根路径 302 到示例页,保证页面内相对导入(../src/、./fixture.js)按 /examples/ 解析
  if (requestPath === '/') {
    response.writeHead(302, { Location: '/examples/native-video.html' });
    response.end();
    return;
  }
  const filePath = normalize(join(root, requestPath.replace(/^\/+/, '')));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  let stat;
  try {
    stat = statSync(filePath);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  const contentType = contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
  // 视频播放/拖动进度条依赖 HTTP Range(206 分段响应)
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (Number.isInteger(start) && Number.isInteger(end) && start <= end && start < stat.size) {
        response.writeHead(206, {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': String(end - start + 1),
          'Accept-Ranges': 'bytes',
        });
        createReadStream(filePath, { start, end }).pipe(response);
        return;
      }
      response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      response.end();
      return;
    }
  }
  response.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': String(stat.size),
    'Accept-Ranges': 'bytes',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`danmux-renderer examples: http://127.0.0.1:${port}`);
});
