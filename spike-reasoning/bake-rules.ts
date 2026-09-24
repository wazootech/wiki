const rulesPath = Deno.args[0];
const outPath = Deno.args[1] ?? "./rules.ts";

const text = Deno.readTextFileSync(rulesPath);
const escaped = text
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");
const body = `export const OWL2RL_N3 = \`${escaped}\`;\n`;
Deno.writeTextFileSync(outPath, body);
const bytes = new TextEncoder().encode(text).length;
console.log(`wrote ${outPath} (${bytes} bytes rules, ${body.length} chars module)`);