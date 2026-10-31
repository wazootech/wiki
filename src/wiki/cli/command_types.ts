interface CommandContext {
  readonly command: string;
  readonly args: readonly string[];
  readonly configPath: string;
  readonly wikiInputs: readonly string[];
}

export interface CommandDefinition {
  readonly names: readonly string[];
  readonly description: string;
  readonly run: (context: CommandContext) => Promise<number>;
}
