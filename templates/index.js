import cover from './Cover';
import listicle from './Listicle';
import quote from './Quote';
import comparison from './Comparison';
import outro from './Outro';

// Template registry. Order here is the order shown in the "add slide" menu.
export const templateList = [cover, listicle, quote, comparison, outro];
export const templates = Object.fromEntries(templateList.map((t) => [t.id, t]));
