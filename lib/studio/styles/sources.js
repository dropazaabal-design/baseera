// Pinned style sources (Design Library V2). Each entry is one file read at
// a fixed commit, identified by its git blob hash, so an extraction can
// prove it read exactly that content. docs/research/sources.md explains
// what each source was used for; docs/library/sources/*.json hold what the
// compiler extracted (scripts/extract-style-sources.mjs). Sources are read,
// never modified or republished; copyleft or unknown licences stay
// reference-only and are not listed here.

const OPENDESIGN_COMMIT = 'e3a848a33a151ba6f29be02e58ab17a9d135b1a7';
const opendesign = (name, blob) => ({ id: `opendesign/${name}`, repo: 'AICAE/opendesign', commit: OPENDESIGN_COMMIT, path: `design-systems/${name}/DESIGN.md`, blob, license: 'Apache-2.0', format: 'design-md' });

export const SOURCES = [
  opendesign('editorial', 'f67fc5abc6b5d62cdc652b578627134138449eec'),
  opendesign('warm-editorial', '491242090884d239a2dc92fa7793b794ee92baea'),
  opendesign('minimal', '6c4ce3012eb067b91ac9c74c8cadccf52e01561e'),
  opendesign('paper', '3306e19fc82b5a22d645c7e0f801681a0b820a52'),
  opendesign('publication', 'fda77a69603c479bcf20901c6ef6233de5ae70e2'),
  opendesign('brutalism', '5922713522dbac4e17fe5eb8ac64af7f5adc0e22'),
  opendesign('doodle', 'b893c161783255605ae23751e1460f1d997218da'),
  { id: 'carousel-generator/design-system', repo: 'idrsdev/social-carousel-generator', commit: '44e6ee5979864a21fd9e47425fcd6fa8242bfe99', path: 'design-system.json', blob: 'd9d36accda05bb70e3d93e038b21ff581947eb7d', license: 'MIT', format: 'json' },
  { id: 'image-text-layout/style-directions', repo: 'Errno722/image-text-layout-skill', commit: '98b065fd9de06730add337bb87eb7cfaeb610172', path: 'references/style-directions.md', blob: '20a0342d57433efe8190af15f1fcaebbf70b5582', license: 'MIT', format: 'notes' },
];

export const sourceById = (id) => SOURCES.find((s) => s.id === id) ?? null;

// The provenance reference a style stores: where, at which commit, which
// content (blob), under which licence.
export const sourceRef = (id) => {
  const s = sourceById(id);
  if (!s) throw new Error(`unknown style source "${id}"`);
  return { repo: s.repo, commit: s.commit, path: s.path, blob: s.blob, license: s.license };
};
