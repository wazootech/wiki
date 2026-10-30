import { type CaseName, type CaseResult, CASES } from "../case.ts";

/** Markdown pages added to every Wiki fixture, for the scoped cases. */
export const PAGES = 50;

interface Options {
  sizes: number[];
  cases: CaseName[];
  timeoutSeconds: number;
  json: string | null;
  out: string | null;
  emit: string | null;
}

/** A case that did not produce a result: it timed out, crashed, or ran out of memory. */
export interface CaseFailure {
  readonly case: CaseName;
  readonly ok: false;
  readonly reason: string;
  readonly totalMs: number;
}

export interface SizeResult {
  readonly targetQuads: number;
  readonly quads: number;
  readonly people: number;
  readonly orgs: number;
  readonly violatingPeople: number;
  readonly cases: readonly (CaseResult | CaseFailure)[];
}

export function parseArgs(args: readonly string[]): Options {
  const options: Options = {
    sizes: [1e3, 1e4, 1e5, 1e6],
    cases: [...CASES],
    timeoutSeconds: 600,
    json: null,
    out: null,
    emit: null,
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    i++;
    if (flag === "--sizes") {
      options.sizes = value.split(",").map(Number);
      if (options.sizes.some((n) => !Number.isFinite(n) || n <= 0)) {
        throw new Error(`--sizes must be positive numbers: ${value}`);
      }
    } else if (flag === "--cases") {
      const cases = value.split(",");
      const unknown = cases.filter((c) => !CASES.includes(c as CaseName));
      if (unknown.length > 0) {
        throw new Error(`Unknown case(s): ${unknown.join(", ")}`);
      }
      options.cases = cases as CaseName[];
    } else if (flag === "--timeout") options.timeoutSeconds = Number(value);
    else if (flag === "--json") options.json = value;
    else if (flag === "--out") options.out = value;
    else if (flag === "--emit") options.emit = value;
    else throw new Error(`Unknown flag: ${flag}`);
  }
  return options;
}
