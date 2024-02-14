# tsc-multi

[![](https://img.shields.io/npm/v/tsc-multi.svg)](https://www.npmjs.com/package/tsc-multi) ![Test](https://github.com/tommy351/tsc-multi/workflows/Test/badge.svg)

Compile multiple TypeScript projects into multiple targets.

## Features

### Multiple targets

tsc-multi can compile your TypeScript projects into multiple modules (e.g. CommonJS, ESM) or targets (e.g. ES6, ES2018) in parallel.

### Project references

tsc-multi supports [project references](https://www.typescriptlang.org/docs/handbook/project-references.html), which are very useful for monorepo. It works just like `tsc --build`. File watching is also supported.

### Rewrite import paths

tsc-multi rewrites all import paths in output files to maximize the compatibility across different platforms such as Node.js, web browser and Deno, because import paths are more strict in ESM.

Example:

```ts
// Input
import dir from "./dir";
import file from "./file";

// Output
import dir from "./dir/index.js";
import file from "./file.js";
```

## Installation

```sh
npm install tsc-multi --save-dev
```

## Usage

Create a `tsc-multi.json` in the folder.

```json
{
  "targets": [
    { "extname": ".cjs", "module": "commonjs" },
    { "extname": ".mjs", "module": "esnext" }
  ],
  "projects": ["packages/*/tsconfig.json"]
}
```

Build TypeScript files.

```sh
tsc-multi
```

Watch changes and rebuild TypeScript files.

```sh
tsc-multi --watch
```

Delete built files.

```sh
tsc-multi --clean
```

## Configuration

### `targets`

Build targets. All options except `extname` and `packageOverrides` will override `compilerOptions` in `tsconfig.json`.

```js
{
  // Rename the extension of output files
  extname: ".js",
  // Set the output package type to module
  packageOverrides: {
    "package.json": { "type": "module" }
  },
  // Skip type-checking (Experimental)
  transpileOnly: false,
  // Compiler options
  module: "esnext",
  target: "es2018",
}
```

### `projects`

Path to TypeScript projects. It can be either a folder which contains `tsconfig.json`, or the path to `tsconfig.json`. This option can be set in either config file or CLI.

```js
[
  // CWD
  ".",
  // Folder
  "pkg-a",
  // tsconfig.json path
  "tsconfig.custom.json",
  // Glob
  "packages/*/tsconfig.json",
];
```

### `compiler`

Specify a custom TypeScript compiler (e.g. [ttypescript]).

### `maxWorkers`

Specify the maximum number of concurrent workers.

## CLI Options

### `--watch`

Watch input files and rebuild when they are changed.

### `--clean`

Delete built files. Only available when `compilerOptions.rootDir` is specified in `tsconfig.json`.

### `--verbose`

Print debug logs.

### `--cwd`

Specify the current working directory (CWD).

### `--config`

Specify the path of the config file. The path can be either a relative path or an absolute path. Default to `$CWD/tsc-multi.json`.

### `--compiler`

Specify a custom TypeScript compiler.

### `--dry`

Show what would be done but doesn't actually build anything.

### `--force`

Rebuild all projects.

### `--maxWorkers`

Specify the maximum number of concurrent workers.

## Caveats

- Only file extension can be renamed currently.
- Only CommonJS and ESM are tested currently, AMD, UMD or SystemJS modules may have issues.
- When workers read/write type declaration files (`.d.ts`), there are few chances that TypeScript compiler might read files that is writing by other workers. This usually only happens on machines with poor IO performance. Set `maxWorkers` to `1` may help.

## License

MIT

[ttypescript]: https://github.com/cevek/ttypescript
