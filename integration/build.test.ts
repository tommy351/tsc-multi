/// <reference types="jest-extended"/>
import execa from "execa";
import { join } from "path";
import tmp from "tmp-promise";
import { copy, writeJSON, readFile, mkdirp } from "fs-extra";
import { Config } from "../src";
import { toMatchFile } from "jest-file-snapshot";
import glob from "fast-glob";

expect.extend({ toMatchFile });

const TMP_DIR = join(__dirname, ".tmp");
const ESM_SUPPORTED = +process.versions.node.split(".")[0] >= 12;

let tmpDir: tmp.DirectoryResult;

beforeAll(async () => {
  await mkdirp(TMP_DIR);
});

beforeEach(async () => {
  tmpDir = await tmp.dir({
    unsafeCleanup: true,
    tmpdir: TMP_DIR,
  });
});

afterEach(async () => {
  await tmpDir.cleanup();
});

function runCLI(args: readonly string[] = [], options?: execa.Options) {
  return execa(join(__dirname, "../bin/tsc-multi.js"), args, {
    cwd: tmpDir.path,
    ...options,
  });
}

async function copyInputFixture(name: string) {
  await copy(join(__dirname, "__fixtures__", name), join(tmpDir.path));
}

async function writeConfigToPath(path: string, config: Partial<Config>) {
  await writeJSON(join(tmpDir.path, path), config);
}

async function writeConfig(config: Partial<Config>) {
  await writeConfigToPath("tsc-multi.json", config);
}

async function listOutputFiles() {
  const paths = await glob(
    ["**", "!**/src", "!**/node_modules", "!**/*.json", "!**/*.tsbuildinfo"],
    {
      cwd: tmpDir.path,
    }
  );
  const fileMap: Record<string, string> = {};

  for (const path of paths) {
    fileMap[path] = await readFile(join(tmpDir.path, path), "utf8");
  }

  return fileMap;
}

async function matchOutputFiles(name: string) {
  const files = await listOutputFiles();

  for (const [path, content] of Object.entries(files)) {
    expect(content).toMatchFile(
      join(__dirname, "__file_snapshots__", name, path)
    );
  }
}

function runCJSModule(path: string) {
  return execa.node(join(tmpDir.path, path));
}

async function runESMModule(path: string) {
  await writeJSON(join(tmpDir.path, "package.json"), { type: "module" });

  return execa.node(join(tmpDir.path, path), [], {
    ...(!ESM_SUPPORTED && { nodeOptions: ["-r", "esm"] }),
  });
}

describe("single project", () => {
  beforeEach(async () => {
    await copyInputFixture("single-project");
  });

  test("only commonjs", async () => {
    await writeConfig({
      targets: [{ module: "commonjs" }],
    });

    const { exitCode } = await runCLI();
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/only-commonjs");

    // Check if the output files are executable
    const result = await runCJSModule("dist/index.js");
    expect(result.stdout).toEqual("Hello TypeScript");
  });

  test("only esnext", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI();
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/only-esnext");

    // Check if the output files are executable
    const result = await runESMModule("dist/index.js");
    expect(result.stdout).toEqual("Hello TypeScript");
  });

  test("multiple targets", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    const { exitCode } = await runCLI();
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/multiple-targets");
  });

  test("set relative config path", async () => {
    await writeConfigToPath("foo.json", {
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI(["--config", "foo.json"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/only-esnext");
  });

  test("set absolute config path", async () => {
    await writeConfigToPath("foo.json", {
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI([
      "--config",
      join(tmpDir.path, "foo.json"),
    ]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/only-esnext");
  });

  test("without config file", async () => {
    const { exitCode } = await runCLI();
    expect(exitCode).toEqual(0);
    await matchOutputFiles("single-project/only-commonjs");
  });

  test("config path is set but not exists", async () => {
    await expect(runCLI(["--config", "foo.json"])).rejects.toThrow();
  });

  test("targets is undefined", async () => {
    await writeConfig({});

    const { exitCode } = await runCLI();
    expect(exitCode).toEqual(0);
    await matchOutputFiles("single-project/only-commonjs");
  });

  test("targets is empty", async () => {
    await writeConfig({ targets: [] });

    const { exitCode } = await runCLI();
    expect(exitCode).toEqual(0);
    await matchOutputFiles("single-project/only-commonjs");
  });

  test("set projects in config file", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
      projects: ["."],
    });

    const { exitCode } = await runCLI([]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/only-esnext");
  });

  test("set cwd", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI(["--cwd", tmpDir.path], {
      cwd: __dirname,
    });
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/only-esnext");
  });

  test("set tsconfig.json path", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI(["tsconfig.custom.json"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/custom-tsconfig");
  });

  test("clean files", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
      projects: ["tsconfig.custom.json"],
    });

    await runCLI([]);

    const { exitCode } = await runCLI(["--clean"]);
    expect(exitCode).toEqual(0);

    expect(await listOutputFiles()).toEqual({});
  });

  test(`extname must be started with "."`, async () => {
    await writeConfig({
      targets: [{ extname: "cjs" }],
    });

    const { exitCode, stderr } = await runCLI([], { reject: false });
    expect(exitCode).not.toEqual(0);

    expect(stderr).toEqual(
      expect.stringContaining(`targets[0].extname must be started with ".".`)
    );
  });

  test("all targets without extname", async () => {
    await writeConfig({
      targets: [{ module: "commonjs" }, { module: "esnext" }],
    });

    const { exitCode, stderr } = await runCLI([], { reject: false });
    expect(exitCode).not.toEqual(0);

    expect(stderr).toEqual(
      expect.stringContaining(
        `targets[1].extname is already used in targets[0].extname`
      )
    );
  });

  test("duplicated extname", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".es2018.js", target: "es2018" },
        { extname: ".cjs", module: "esnext" },
      ],
    });

    const { exitCode, stderr } = await runCLI([], { reject: false });
    expect(exitCode).not.toEqual(0);

    expect(stderr).toEqual(
      expect.stringContaining(
        `targets[2].extname is already used in targets[0].extname`
      )
    );
  });

  test("set declarationDir in target", async () => {
    await writeConfig({
      targets: [{ declarationDir: "./types" }],
    });

    const { exitCode } = await runCLI([]);
    expect(exitCode).toEqual(0);
  });

  test("dry run", async () => {
    const { exitCode } = await runCLI(["--dry"]);
    expect(exitCode).toEqual(0);

    await expect(listOutputFiles()).resolves.toEqual({});
  });

  test("force rebuild", async () => {
    // First build
    await runCLI([]);

    // Force rebuild
    const { exitCode } = await runCLI(["--force"]);
    expect(exitCode).toEqual(0);
    await matchOutputFiles("single-project/only-commonjs");
  });

  test("set maxWorkers in config", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
      maxWorkers: 1,
    });

    const { exitCode } = await runCLI();
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/multiple-targets");
  });

  test("maxWorkers=0 in config", async () => {
    await writeConfig({
      maxWorkers: 0,
    });

    const { exitCode, stderr } = await runCLI([], { reject: false });
    expect(exitCode).toEqual(1);

    expect(stderr).toEqual(
      expect.stringContaining(
        "StructError: At path: maxWorkers -- Expected a integer greater than or equal to 1 but received `0`"
      )
    );
  });

  test("maxWorkers=3.14 in config", async () => {
    await writeConfig({
      maxWorkers: 3.14,
    });

    const { exitCode, stderr } = await runCLI([], { reject: false });
    expect(exitCode).toEqual(1);

    expect(stderr).toEqual(
      expect.stringContaining(
        "StructError: At path: maxWorkers -- Expected an integer, but received: 3.14"
      )
    );
  });

  test("set maxWorkers in CLI", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    const { exitCode } = await runCLI(["--maxWorkers", "1"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/multiple-targets");
  });
});

describe("project references", () => {
  beforeEach(async () => {
    await copyInputFixture("project-references");
  });

  test("only commonjs", async () => {
    await writeConfig({
      targets: [{ module: "commonjs" }],
    });

    const { exitCode } = await runCLI(["main", "print"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("project-references/only-commonjs");

    // Check if the output files are executable
    const result = await runCJSModule("main/dist/index.js");
    expect(result.stdout).toEqual("Hello TypeScript");
  });

  test("only esnext", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI(["main", "print"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("project-references/only-esnext");

    // Check if the output files are executable
    const result = await runESMModule("main/dist/index.js");
    expect(result.stdout).toEqual("Hello TypeScript");
  });

  test("multiple targets", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    const { exitCode } = await runCLI(["main", "print"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("project-references/multiple-targets");

    // Test if tsbuildinfo files are separated between workers
    const tsBuildInfoFiles = await glob(["**/*.tsbuildinfo"], {
      cwd: tmpDir.path,
    });
    expect(tsBuildInfoFiles).toIncludeSameMembers([
      "main/tsconfig.cjs.tsbuildinfo",
      "main/tsconfig.mjs.tsbuildinfo",
      "print/tsconfig.cjs.tsbuildinfo",
      "print/tsconfig.mjs.tsbuildinfo",
    ]);
  });

  test("clean files", async () => {
    await writeConfig({
      projects: ["main", "print"],
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    await runCLI([]);

    const { exitCode } = await runCLI(["--clean"]);
    expect(exitCode).toEqual(0);

    expect(await listOutputFiles()).toEqual({});
  });

  test("use glob in CLI", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
    });

    await runCLI(["*/tsconfig.json"]);

    const { exitCode } = await runCLI(["--clean"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("project-references/only-esnext");
  });

  test("use glob in config file", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
      projects: ["*/tsconfig.json"],
    });

    await runCLI([]);

    const { exitCode } = await runCLI(["--clean"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("project-references/only-esnext");
  });
});

describe("nested folders", () => {
  beforeEach(async () => {
    await copyInputFixture("nested-folders");
  });

  test("multiple targets", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    const { exitCode } = await runCLI(["."]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("nested-folders");

    const expectedOutput = "Hello TypeScript";

    // Check if the output files are executable
    let result = await runCJSModule("dist/index.cjs");
    expect(result.stdout).toEqual(expectedOutput);

    // Check if the output files are executable
    result = await runESMModule("dist/index.mjs");
    expect(result.stdout).toEqual(expectedOutput);
  });
});

describe("custom compiler", () => {
  beforeEach(async () => {
    await copyInputFixture("custom-compiler");
  });

  test("set in CLI", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    const { exitCode } = await runCLI([".", "--compiler", "ttypescript"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("custom-compiler");
  });

  test("set in config file", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
      compiler: "ttypescript",
    });

    const { exitCode } = await runCLI(["."]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("custom-compiler");
  });
});

describe("import path includes dot", () => {
  beforeEach(async () => {
    await copyInputFixture("dot-import");
  });

  test("multiple targets", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    const { exitCode } = await runCLI(["."]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("dot-import");

    const expectedOutput = "dot.file.dot.folder";

    // Check if the output files are executable
    let result = await runCJSModule("dist/index.cjs");
    expect(result.stdout).toEqual(expectedOutput);

    // Check if the output files are executable
    result = await runESMModule("dist/index.mjs");
    expect(result.stdout).toEqual(expectedOutput);
  });
});

describe("import path ends with .js", () => {
  beforeEach(async () => {
    await copyInputFixture("js-ext-import");
  });

  test("multiple targets", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    const { exitCode } = await runCLI(["."]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("js-ext-import");

    const expectedOutput = "Hello world";

    // Check if the output files are executable
    let result = await runCJSModule("dist/index.cjs");
    expect(result.stdout).toEqual(expectedOutput);

    // Check if the output files are executable
    result = await runESMModule("dist/index.mjs");
    expect(result.stdout).toEqual(expectedOutput);
  });
});

describe("extra options in target", () => {
  beforeEach(async () => {
    await copyInputFixture("remove-comments");
  });

  test("success", async () => {
    await writeConfig({
      targets: [{ removeComments: true }],
    });

    const { exitCode } = await runCLI(["."]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("remove-comments");
  });
});

describe("type error", () => {
  beforeEach(async () => {
    await copyInputFixture("type-error");
  });

  test("should throw error", async () => {
    const { exitCode, stderr } = await runCLI(["."], { reject: false });
    expect(exitCode).not.toEqual(0);

    expect(stderr).toEqual(
      expect.stringContaining(
        `Type 'number' is not assignable to type 'string'.`
      )
    );
    expect(stderr).toEqual(expect.stringContaining("Found 1 error."));
  });
});

describe("multi type errors", () => {
  beforeEach(async () => {
    await copyInputFixture("multi-type-errors");
  });

  test("should throw error", async () => {
    const { exitCode, stderr } = await runCLI(["."], { reject: false });
    expect(exitCode).not.toEqual(0);

    expect(stderr).toEqual(
      expect.stringContaining(
        `Type 'number' is not assignable to type 'string'.`
      )
    );
    expect(stderr).toEqual(
      expect.stringContaining(
        `Property 'push' does not exist on type 'readonly string[]'.`
      )
    );
    expect(stderr).toEqual(expect.stringContaining("Found 2 errors."));
  });
});

describe("tsconfig error", () => {
  beforeEach(async () => {
    await copyInputFixture("tsconfig-error");
  });

  test("should throw error", async () => {
    const { exitCode, stderr } = await runCLI(["."], { reject: false });
    expect(exitCode).not.toEqual(0);

    expect(stderr).toEqual(
      expect.stringContaining(`Argument for '--lib' option must be`)
    );
    expect(stderr).toEqual(expect.stringContaining("Found 1 error."));
  });
});

describe("allowJs", () => {
  beforeEach(async () => {
    await copyInputFixture("allow-js");
  });

  test("success", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    const { exitCode } = await runCLI([]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("allow-js");
  });
});

describe("dynamic import", () => {
  beforeEach(async () => {
    await copyInputFixture("dynamic-import");
  });

  test("success", async () => {
    await writeConfig({
      targets: [
        { extname: ".cjs", module: "commonjs" },
        { extname: ".mjs", module: "esnext" },
      ],
    });

    const { exitCode } = await runCLI();
    expect(exitCode).toEqual(0);

    await matchOutputFiles("dynamic-import");

    // Check if the output files are executable
    const cjsResult = await runCJSModule("dist/index.cjs");
    expect(cjsResult.stdout).toEqual("Hello Dynamic");

    // Skip the following tests if ESM is not natively supported on Node.js.
    // Because the `esm` package somehow doesn't support dynamic import .mjs
    // files?
    if (ESM_SUPPORTED) {
      const esmResult = await runCJSModule("dist/index.mjs");
      // eslint-disable-next-line jest/no-conditional-expect
      expect(esmResult.stdout).toEqual("Hello Dynamic");
    }
  });
});
