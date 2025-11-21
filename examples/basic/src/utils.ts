import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { access } from 'fs/promises';

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 检查 URL 是否可访问
 * @param url 要检查的 URL
 * @returns Promise<boolean> 返回 URL 是否可访问
 */
export function checkUrlAccessible(url?: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) {
      return resolve(false);
    }
    try {
      const parsedUrl = new URL(url);

      if (parsedUrl.protocol === 'file:') {
        // Handle file:// URLs
        const filePath = fileURLToPath(parsedUrl);
        access(filePath)
          .then(() => resolve(true))
          .catch(() => resolve(false));
      } else if (['https:', 'http:'].includes(parsedUrl.protocol)) {
        // Handle http(s):// URLs
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const request = client.request(url, { method: 'HEAD', timeout: 5000 }, (response) => {
          resolve(response.statusCode !== undefined && response.statusCode < 400);
        });

        request.on('error', () => {
          resolve(false);
        });

        request.on('timeout', () => {
          request.destroy();
          resolve(false);
        });

        request.end();
      } else {
        // Unsupported protocol
        resolve(false);
      }
    } catch (error) {
      resolve(false);
    }
  });
}
