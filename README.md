# tsc-multi

[![](https://img.shields.io/npm/v/tsc-multi.svg)](https://www.npmjs.com/package/tsc-multi) ![Test](https://github.com/tommy351/tsc-multi/workflows/Test/badge.svg)

Compile multiple TypeScript projects into multiple targets.

## Installation

```sh
npm install tsc-multi --save-dev
```

## Usage

Create `tsc-multi.json` in the folder.

```json
{
  "targets": [
    { "extname": ".cjs", "module": "commonjs" },
    { "extname": ".mjs", "module": "esnext" }
  ]
}
```

Build TypeScript files.

```sh
tsc-multi ./pkg-a ./pkg-b
```

Watch changes and rebuild TypeScript files.

```sh
tsc-multi ./pkg-a ./pkg-b --watch
```

Delete built files. (Only available when `compilerOptions.rootDir` is configured in `tsconfig.json`.)

```sh
tsc-multi ./pkg-a ./pkg-b --clean
```

## Configuration

Below is a full example of `tsc-multi.json`.

```json
{
  "targets": [
    { "extname": ".cjs", "module": "commonjs" },
    { "extname": ".mjs", "module": "esnext" }
  ],
  "projects": ["pkg-a", "pkg-b"]
}
```

### `targets`

Build targets. All options except `extname` will override `compilerOptions` in `tsconfig.json`. At least one target is required.

### `projects`

Path to TypeScript projects. It can be either a folder which contains `tsconfig.json`, or the path to `tsconfig.json`. This option can be set in either the config file or CLI. At least one project is required.

## License

MIT
