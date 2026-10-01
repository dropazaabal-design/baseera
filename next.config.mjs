// GitHub Pages serves project sites from /<repo>. The deploy workflow passes
// that prefix in; locally it is empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default {
  output: 'export',
  basePath,
  trailingSlash: true,
};
