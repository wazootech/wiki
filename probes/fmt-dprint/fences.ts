/**
 * One document per fence tag: does the in-process route agree with `deno fmt`?
 *
 * The real corpus covers only the tags the wikis happen to use — `yaml`, `json`,
 * `bash`, `sparql`, `python`, `toml`, `xml`, `ts`, `js` and two `html`. `css`,
 * `scss`, `less`, `markdown`, `graphql`, `dockerfile`, `rs`, `cs`, `vb` and the
 * `cjs`/`cts`/`mjs`/`mts` aliases are never exercised by it, and those are
 * exactly the tags where the two tag tables (deno's `matches!` list vs. the
 * plugin wasm's `tag_to_extension`) disagree. So they are tested here instead of
 * being assumed.
 *
 * Each tag gets its own document, so a disagreement names the tag outright.
 * Bodies are deliberately unformatted: a tag that is delegated but whose body is
 * already canonical would compare equal for the wrong reason.
 */

import { denoFmtRoute } from "./harness.ts";
import { buildFaithfulRoute } from "./route.ts";

const BODIES: Record<string, string> = {
  ts: "const x={a:1,b:[1,2]}",
  tsx: "const x=<div a={1}>t</div>",
  js: "const x={a:1,b:[1,2]}",
  jsx: "const x=<div a={1}>t</div>",
  cjs: "const x={a:1}",
  cts: "const x={a:1}",
  mjs: "const x={a:1}",
  mts: "const x={a:1}",
  javascript: "const x={a:1}",
  typescript: "const x={a:1}",
  json: '{"a":1,"b":[1,2]}',
  jsonc: '{"a":1}',
  css: "a{color:red;margin:0}",
  scss: "a{color:red;b{margin:0}}",
  less: "a{color:red;b{margin:0}}",
  // Must be a body lax-markup actually rewrites — `<div><span>x</span></div>`
  // is already canonical, so it would compare equal for the wrong reason and
  // hide the one tag the wasm gate cannot delegate.
  html: "<html>\n<head>\n<title>t</title>\n</head>\n<body>\n<p>x</p>\n</body>\n</html>",
  xml: "<a><b/></a>",
  svg: '<svg viewBox="0 0 1 1"><rect x="0"/></svg>',
  svelte: "<div>{x}</div>",
  vue: "<template><div>x</div></template>",
  astro: "<div>x</div>",
  vto: "<div>x</div>",
  njk: "<div>x</div>",
  yml: "a:   1",
  yaml: "a:   1",
  sql: "select * from t where x=1",
  toml: "a=1",
  python: "x=1",
  py: "x=1",
  rs: "fn  main(){let x=1;}",
  rust: "fn  main(){let x=1;}",
  cs: "class A{void B(){}}",
  vb: "Module A\nEnd Module",
  graphql: "{a}",
  dockerfile: "FROM alpine",
  markdown: "# H\n\n*em*",
  bash: 'echo "hello"',
  sparql: "SELECT ?s WHERE { ?s ?p ?o }",
  txt: "just text",
  empty: "",
};

const route = buildFaithfulRoute({
  htmlFencePostPass: !Deno.args.includes("--no-post-pass"),
});

let same = 0;
const differences: string[] = [];
for (const [tag, body] of Object.entries(BODIES)) {
  const doc = `# ${tag}\n\n\`\`\`${tag}\n${body}\n\`\`\`\n`;
  const dprintOut = route.format("Page.md", doc);
  const denoOut = await denoFmtRoute(doc);
  if (dprintOut === denoOut) {
    same++;
  } else {
    differences.push(tag);
    console.log(`DIFF  ${tag}`);
    console.log(`  deno   ${JSON.stringify(denoOut)}`);
    console.log(`  dprint ${JSON.stringify(dprintOut)}`);
  }
}
console.log(`\n${same}/${Object.keys(BODIES).length} fence tags byte-identical`);
if (differences.length > 0) console.log(`differing: ${differences.join(", ")}`);
