import fs from "fs/promises";
import minimist from "minimist";
import { promisify } from "util";
import globCallback from "glob";
import path from "path";
import shell from "shelljs";

const glob = promisify(globCallback);
const argv = minimist(process.argv.slice(2));

// Output help and then stop if help requested
if (argv.help) {
  console.log(`
    Usage:
      $ ts-node src/index.ts [options] [sourceDir]

    SourceDir: Path containing EPS files to rip previews from. In "double quotes" to avoid problems with Windows file system.

               Defaults to the current directory.

    Options:
      --help       Show this help message
      --outDir     Output directory, defaults to "./out"
  `);
  process.exit(0);
}

// Create the output directory, then scan the source directory for EPS files and rip previews from them
const filePath = argv._[0] ?? ".";
const outDir = argv.outDir ?? "out";

shell.mkdir("-p", outDir);

(async function () {
  const files = await glob(`${filePath}/*.eps`);

  for await (const file of files) {
    const { name } = path.parse(file);
    
    const data = await fs.readFile(file);

    // Skip files that don't have a native header
    if (data.readUInt32BE(0) !== 0xC5D0D3C6) {
      console.warn(`Skipping ${name} because it doesn't have a native header`);
      continue;
    }

    await extractImage(data, "tiff", name);
    await extractImage(data, "wmf", name);
  }
})();

// Map image extensions to the offset in the EPS native header
const types = {
  tiff: 20,
  wmf: 12  
};

// Extract the image data from buffer and write it to a file
async function extractImage(data: Buffer, type: keyof typeof types, name: string) {
  const offset = data.readUInt32LE(types[type]);
  const size = data.readUInt32LE(types[type] + 4);

  if (!offset || !size) {
    return;
  }

  const imageData = data.slice(offset, offset + size);
  await fs.writeFile(`${outDir}/${name}.${type}`, imageData);
}
