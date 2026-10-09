#!/usr/bin/env node
// `basira`: the studio CLI (scripts/studio-cli.js) under the product's name,
// with human-readable reports by default for the analysis commands:
//
//   basira analyze-post post.txt --platform x
//   basira analyze-carousel carousel.json --platform instagram
//   basira analyze-content content.json --platform all
//   basira analytics import instagram insights.json
//   basira analytics profile
//
// Add --format json for the JSON every studio command prints.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './studio-cli.js';

const TEXT_DEFAULT = new Set(['analyze-post', 'analyze-carousel', 'analyze-reel', 'analyze-content', 'review-reel', 'analytics']);

export function withDefaults(argv) {
  const args = [...argv];
  const textCmd = TEXT_DEFAULT.has(args[0]) && (args[0] !== 'analytics' || args[1] === 'profile') && !(args[0] === 'review-reel' && args[1] === 'doctor');
  if (textCmd && !args.includes('--format')) args.push('--format', 'text');
  if (textCmd && !args.includes('--lang')) args.push('--lang', 'en');
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(withDefaults(process.argv.slice(2))).catch((err) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: err.message }, null, 2)}\n`);
    process.exit(1);
  });
}
