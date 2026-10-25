import { expect, test } from "bun:test";

test("README documents installation, all commands, and development checks", async () => {
  const readme = await Bun.file(new URL("../README.md", import.meta.url)).text();

  expect(readme).toContain("## Install");
  expect(readme).toContain("## Usage");
  expect(readme).toContain("## Commands");
  expect(readme).toContain("## Development");
  expect(readme).toContain(
    "```text\n" +
      "usage: nodepluck select [--paths] QUERY DOC\n" +
      "usage: nodepluck explain QUERY\n" +
      "usage: nodepluck slice SPEC LENGTH\n" +
      "usage: nodepluck quote [--double] TEXT\n" +
      "usage: nodepluck unquote LITERAL\n" +
      "usage: nodepluck check FILE...\n" +
      "```",
  );
  expect(readme).toContain("bun src/main.ts select '$.store.book[*].title' sample.json");
  expect(readme).toContain("bun src/main.ts explain '$.store.book[*].title'");
  expect(readme).toContain("bun src/main.ts slice '1:4:2' 6");
  expect(readme).toContain('bun src/main.ts quote "hello"');
  expect(readme).toContain(`bun src/main.ts unquote "'hello'"`);
  expect(readme).toContain("bun src/main.ts check queries.txt");
  expect(readme).toContain("bun run typecheck");
  expect(readme).toContain("bun run lint");
  expect(readme).toContain("bun test");
});
