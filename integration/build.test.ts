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

    const { exitCode } = await runCLI(["."]);
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

    const { exitCode } = await runCLI(["."]);
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

    const { exitCode } = await runCLI(["."]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/multiple-targets");
  });

  test("set relative config path", async () => {
    await writeConfigToPath("foo.json", {
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI([".", "--config", "foo.json"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/only-esnext");
  });

  test("set absolute config path", async () => {
    await writeConfigToPath("foo.json", {
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI([
      ".",
      "--config",
      join(tmpDir.path, "foo.json"),
    ]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("single-project/only-esnext");
  });

  test("without config file", async () => {
    await expect(runCLI(["."])).rejects.toThrow();
  });

  test("config path is set but not exists", async () => {
    await expect(runCLI([".", "--config", "foo.json"])).rejects.toThrow();
  });

  test("targets is empty", async () => {
    await writeConfig({ targets: [] });
    await expect(runCLI(["."])).rejects.toThrow();
  });

  test("projects is empty", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
    });
    await expect(runCLI([])).rejects.toThrow();
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

    const { exitCode } = await runCLI([".", "--cwd", tmpDir.path], {
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
});

describe("nested folders", () => {
  beforeEach(async () => {
    await copyInputFixture("nested-folders");
  });

  test("only commonjs", async () => {
    await writeConfig({
      targets: [{ module: "commonjs" }],
    });

    const { exitCode } = await runCLI(["."]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("nested-folders/only-commonjs");

    // Check if the output files are executable
    const result = await runCJSModule("dist/index.js");
    expect(result.stdout).toEqual("Hello TypeScript");
  });

  test("only esnext", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI(["."]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("nested-folders/only-esnext");

    // Check if the output files are executable
    const result = await runESMModule("dist/index.js");
    expect(result.stdout).toEqual("Hello TypeScript");
  });
});

describe("custom compiler", () => {
  beforeEach(async () => {
    await copyInputFixture("custom-compiler");
  });

  test("set in CLI", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
    });

    const { exitCode } = await runCLI([".", "--compiler", "ttypescript"]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("custom-compiler");
  });

  test("set in config file", async () => {
    await writeConfig({
      targets: [{ module: "esnext" }],
      compiler: "ttypescript",
    });

    const { exitCode } = await runCLI(["."]);
    expect(exitCode).toEqual(0);

    await matchOutputFiles("custom-compiler");
  });
});
