// What goes into each platform's package, shared by the build and the tests.
//   claude   the whole plugin: Claude's manifest, the MCP server and its
//            .mcp.json, skills, CLIs, assets
//   chatgpt  ChatGPT and Codex: the Agent Plugins manifest (plugin.json),
//            assets and skills with the CLIs. That manifest has no field for
//            MCP servers, so no .mcp.json and no MCP server file.
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export const PACKAGES = {
  claude: { zip: 'dist/arabic-carousel-plugin.zip', skip: [] },
  chatgpt: { zip: 'dist/arabic-carousel-chatgpt.zip', skip: ['.claude-plugin', '.mcp.json', 'skills/canva-arabic/scripts/canva-mcp.mjs'] },
};

export async function packageFiles(pluginDir, platform) {
  const { skip } = PACKAGES[platform];
  const out = [];
  const walk = async (rel) => {
    for (const entry of await fs.readdir(path.join(pluginDir, rel), { withFileTypes: true })) {
      const relPath = path.posix.join(rel, entry.name);
      if (skip.includes(relPath)) continue;
      if (entry.isDirectory()) await walk(relPath);
      else out.push(relPath);
    }
  };
  await walk('');
  return out.sort();
}

export async function zipPackage(pluginDir, platform, outFile) {
  const zip = new JSZip();
  for (const rel of await packageFiles(pluginDir, platform)) zip.file(rel, await fs.readFile(path.join(pluginDir, rel)));
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
