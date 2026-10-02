# How the Canva tools reach each host

The eleven `canva_*` tools are one program (`scripts/canva.mjs` as a CLI, `scripts/canva-mcp.mjs`
as a local MCP server over stdio). What each host can start decides how they arrive. Nothing
here is assumed: each line says what was tested, when, and how.

| Host | Package | How the tools bind | Tested |
|---|---|---|---|
| Claude Code (CLI, desktop Code tab) | `arabic-carousel-plugin.zip`, or `/plugin install arabic-carousel@baseera` | The plugin's `.mcp.json` declares the stdio server `baseera-canva`; Claude Code starts it. Tools appear as `mcp__plugin_arabic-carousel_baseera-canva__canva_*`. `CANVA_ACCESS_TOKEN` is passed by reference (`${CANVA_ACCESS_TOKEN:-}`), never stored. | 2026-10-02, Claude Code 2.1.287, isolated config: `claude plugin validate` passed; installed from the repo's marketplace; `claude mcp list` → `plugin:arabic-carousel:baseera-canva … Connected`; a headless session listed all 11 tools and called `canva_capabilities` (`text.font-family`) through the host and got the expected result. |
| Claude apps (claude.ai web/desktop chat) with an uploaded plugin | `arabic-carousel-plugin.zip` | Skills load. Whether a plugin's local MCP server is started there was **not tested**; if the `canva_*` tools are not in the tool list, use the CLI when the sandbox has Node 18+. | Not tested. |
| ChatGPT | `arabic-carousel-chatgpt.zip` | The Agent Plugins manifest (`plugin.json`, schema 1.0.0) has no field for MCP servers, so this package ships **skills and the CLI only**: no `.mcp.json`, no MCP server file. Canva work goes through ChatGPT's own Canva connector, whatever its tool names: pass its tool list with schemas to `canva_capabilities` and the plans are written for it (e.g. `perform_editing_operations` on `element_id`, `import_design_from_url` with `design_file`). The CLI runs only if the code environment has Node 18+. | Package contents tested; running inside ChatGPT **not tested**. |
| Codex | `arabic-carousel-chatgpt.zip` | Same package: skills and the CLI. Codex can register local MCP servers in its own configuration, but this package does not configure that and it was **not tested**. | Package contents tested; Codex itself **not tested**. |

A host that cannot run Node gets the skills as guidance only: say so instead of describing tool
results that were never produced.
