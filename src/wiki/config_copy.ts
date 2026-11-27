/** Derive a config that differs from another in whole top-level blocks. */

import { Config } from "./config.ts";

/**
 * A copy of `config` with one or more top-level blocks replaced.
 *
 * The copy is made with `Object.create` so that the class's methods survive —
 * `Config.isExcluded` is called on every document scan — and shares every block
 * it is not asked to replace. Sharing is safe for the blocks that are already
 * immutable in practice (`graph`, `link`, `check`, `lint`) and is *not* safe for
 * `wiki.input`, which is why `Wiki.load` builds that list before copying rather
 * than appending to a shared one.
 */
export function copyConfig(
  config: Config,
  blocks: { readonly wiki?: Config["wiki"]; readonly site?: Config["site"] },
): Config {
  const copy = Object.create(Config.prototype) as Config;
  Object.assign(
    copy,
    config,
    blocks.wiki === undefined ? {} : { wiki: blocks.wiki },
    blocks.site === undefined ? {} : { site: blocks.site },
  );
  return copy;
}
