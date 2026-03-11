import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

function prerenderPlugin(): Plugin {
  const routes = [
    '/',
    '/agenda',
    '/tickets',
    '/location',
    '/gallery',
    '/contact',
    '/info',
    '/archive',
    '/terms',
    '/terms-nl',
    '/terms-en',
    '/terms-tr',
  ];

  return {
    name: 'vite:prerender',
    enforce: 'post',
    async closeBundle() {
      const fs = await import('fs');
      const path = await import('path');
      const http = await import('http');

      const distDir = resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;

      // Start a simple static server
      const server = http.createServer((req, res) => {
        let filePath = path.join(distDir, req.url || '/');
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }
        const ext = path.extname(filePath);
        const mimeTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      });

      const port = 13579;
      await new Promise<void>((res) => server.listen(port, res));

      try {
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        for (const route of routes) {
          try {
            const page = await browser.newPage();

            // Inject prerendering flag
            await page.evaluateOnNewDocument(() => {
              (window as any).__PRERENDER_INJECTED = { isPrerendering: true };
            });

            await page.goto(`http://localhost:${port}${route}`, {
              waitUntil: 'networkidle0',
              timeout: 30000,
            });

            // Wait for prerender-ready event or timeout after 10s
            await page.evaluate(() => {
              return new Promise<void>((resolve) => {
                if (document.querySelector('[data-prerender-ready]')) {
                  resolve();
                  return;
                }
                document.addEventListener('prerender-ready', () => resolve());
                setTimeout(() => resolve(), 10000);
              });
            });

            let html = await page.content();

            // Add prerender meta tag
            html = html.replace(
              '</head>',
              '<meta name="prerender-status" content="pre-rendered" />\n</head>'
            );

            // Write to file
            const routePath = route === '/' ? '/index.html' : `${route}/index.html`;
            const filePath = path.join(distDir, routePath);
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, html);
            await page.close();
          } catch (err: any) {
            console.error(`  ❌ ${route}: ${err.message}`);
          }
        }

        await browser.close();
      } catch (err: any) {
        console.error('Pre-rendering failed:', err.message);
        console.error('Build succeeded but pre-rendering was skipped.');
      }

      server.close();
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    prerenderPlugin(),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['react-easy-crop'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https: http:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mollie.com; frame-src https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self';",
    },
  },
});
