<p align="center"><img src="docs/logo.svg" width="96" alt="" /></p>

# nodepluck

[![CI](https://github.com/Gulliby-development/nodepluck/actions/workflows/ci.yml/badge.svg)](https://github.com/Gulliby-development/nodepluck/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

nodepluck is an offline command-line tool for working with JSONPath queries. It
is for people who write queries for APIs, configuration, or logs and want to
inspect what a query means, select JSON values, convert string literals, or
check query files for likely mistakes. It implements a useful RFC 9535 subset;
it does not support the `match` or `search` functions.

## Install

Install [Bun](https://bun.sh/) and use a checkout of this repository. From the
repository root, install the development dependencies:

```sh
bun install
```

This is a private project, not a published package; no global `nodepluck`
executable is assumed. Run the program from the repository root with
`bun src/main.ts`, followed by a command and its arguments. The examples below
use POSIX-style shell quoting: single quotes keep query text such as `$` from
being expanded by the shell. PowerShell also supports these simple single-quoted
arguments; double any embedded single quote when writing a PowerShell
single-quoted string. Other shells may need equivalent quoting.

## Usage

The general form is:

```text
bun src/main.ts COMMAND [OPTIONS] ARGUMENTS
```

The command-specific usage forms appear in [Commands](#commands). The words in
uppercase are placeholders, not literal arguments.

For the selection examples, create a file named `sample.json` in the repository
root with this content:

```json
{"store":{"book":[{"title":"A","price":8.95},{"title":"B","price":12.99}]}}
```

For the `check` example, create `queries.txt` in the same directory with one
query on each non-empty line:

```text
$.store.book[*].title
$.store.book[?@.price<10].title
```

These are instructions for files you create; the project does not install
sample data or add fixture files.

Run each command from the repository root:

```sh
bun src/main.ts select '$.store.book[*].title' sample.json
bun src/main.ts explain '$.store.book[*].title'
bun src/main.ts slice '1:4:2' 6
bun src/main.ts quote "hello"
bun src/main.ts unquote "'hello'"
bun src/main.ts check queries.txt
```

Their outputs, in order (the table has one row per selector; `quote` and
`unquote` print no final line feed):

```text
"A"
"B"
```

```text
N  SEG  COL  MODE   SELECTOR  DETAIL
1  1    3    child  name      "store"
2  2    9    child  name      "book"
3  3    14   child  wildcard  -
4  4    17   child  name      "title"
```

```text
1
3
```

```text
'hello'
```

```text
hello
```

```text
2 queries checked, 0 problems
```

- `select` evaluates a query against a JSON document and prints each selected
  value as compact JSON on its own line. Add `--paths` to print each normalized
  JSONPath, a tab, and then its value.
- `explain` lists a query's selectors, their columns, and their source details
  in a table.
- `slice` prints the indexes selected by a slice for the given array length.
- `quote` turns text into a single-quoted JSONPath string literal.
- `unquote` decodes a single- or double-quoted JSONPath string literal.
  `quote` and `unquote` write their result without adding a line feed.
- `check` reads query lines from one or more files and reports syntax faults
  and doubtful patterns.

Use `-` in place of a document path for `select`, or as a `check` file
argument, to read from standard input. Standard input can be named only once in
a command. For example, this reads a JSON document from a redirected file:

```sh
bun src/main.ts select '$.store.book[*].title' - < sample.json
```

A successful command exits with status 0. Status 1 means a negative result:
`select` found no values, `explain` found no selectors, `slice` selected no
indexes, or `check` found problems. Status 2 means an error, such as invalid
input, a bad argument, or an unreadable file.

The implementation preserves JSON object member order, including numeric-like
keys; if an object repeats a name, its last value occupies the name's original
position. String ordering, string length, and diagnostic columns use Unicode
code points. The tool does not normalize Unicode text. Query nesting is limited
to 32 open levels, JSON documents to 64 nested arrays or objects, and selection
to 10,000 nodes after each query segment. The `slice` command accepts LENGTH
values from 0 through 10,000, written with 1 to 5 ASCII digits.

The supported filter functions are `length`, `count`, and `value`.
`match` and `search` are not implemented. nodepluck reads only the files
named in its arguments (and standard input when `-` is used); it does not use
a network connection or require a service.

## Commands

The six usage forms, in `--help` order, are:

```text
usage: nodepluck select [--paths] QUERY DOC
usage: nodepluck explain QUERY
usage: nodepluck slice SPEC LENGTH
usage: nodepluck quote TEXT
usage: nodepluck unquote LITERAL
usage: nodepluck check FILE...
```

- `select [--paths] QUERY DOC` — select and print JSON values from `DOC`;
  `DOC` may be `-` for standard input.
- `explain QUERY` — display the selectors in a query.
- `slice SPEC LENGTH` — list indexes selected by `SPEC`; `LENGTH` must be
  from 0 to 10,000, written with 1 to 5 ASCII digits.
- `quote TEXT` — encode text as a JSONPath string literal.
- `unquote LITERAL` — decode a JSONPath string literal.
- `check FILE...` — check query lines in one or more files; `-` reads
  standard input.

## Development

Run these checks from the repository root:

```sh
bun run typecheck
bun run lint
bun test
```

## License

MIT, see [LICENSE](LICENSE).

---

Built with BAKED.
