/**
 * prepare-mobile-runtime.mjs — assemble the Android runtime payload.
 *
 * The mobile app ships the desktop Next.js standalone server and runs it in a
 * bundled Node process; the WebView simply loads loopback HTTP. That means two
 * binary pieces have to be produced here, outside Gradle:
 *
 *  1. `lh-server.zip` — the curated standalone tree (repo-only directories and
 *     desktop native packages removed, Android native packages swapped in)
 *     plus `runtime/lib/*.so`, the shared libraries Node itself links against.
 *  2. `liblh-node.so` — the Node executable, placed in jniLibs so Android
 *     extracts it to the read-only nativeLibraryDir (API 29+ refuses to exec
 *     files from the writable app data dir).
 *
 * Node 24 comes from the Termux aarch64 package set (prebuilt against bionic
 * with NDK libc++), which is why the shared libraries are pulled from the same
 * mirror: building Node from source for Android was abandoned — it cannot
 * cross-build its host tools without patching ICU/V8 makefiles.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";

const MOBILE = path.resolve(import.meta.dirname, "..");
const ROOT = path.resolve(MOBILE, "..");
const STANDALONE = path.join(ROOT, ".next", "standalone");
const CACHE = path.join(MOBILE, ".cache", "runtime");
const STAGE = path.join(CACHE, "stage");
const ASSETS_OUT = path.join(MOBILE, "android", "app", "build", "generated", "lh-assets");
const JNI_OUT = path.join(MOBILE, "android", "app", "build", "generated", "lh-jniLibs");
const MIRROR = "https://mirrors.tuna.tsinghua.edu.cn/termux/apt/termux-main/";

/** Termux packages: `nodejs-lts` is the runtime; the rest are its NEEDED libs. */
const TERMUX_PACKAGES = ["nodejs-lts", "libc++", "libicu", "libsqlite", "openssl", "c-ares", "zlib"];

/** NEEDED entries of the Termux node binary — exact sonames, so a mirror bump
 *  that drops one fails here instead of at runtime with a dlopen error. */
const NODE_LIBS = [
	"libc++_shared.so",
	"libcares.so",
	"libsqlite3.so",
	"libz.so.1",
	"libssl.so.3",
	"libcrypto.so.3",
	"libicui18n.so.79",
	"libicuuc.so.79",
	"libicudata.so.79",
];

/** Desktop-only traces and repo scaffolding that must not ride in the APK. */
const EXCLUDE = [
	"mobile",
	"docs",
	"tests",
	"electron",
	".git",
	".next/cache",
	"tsconfig.tsbuildinfo",
	"package-lock.json",
	"node_modules/@napi-rs/canvas-darwin-arm64",
	"node_modules/@napi-rs/canvas-darwin-x64",
	"node_modules/@resvg/resvg-js-darwin-arm64",
	"node_modules/@resvg/resvg-js-darwin-x64",
	"node_modules/@img",
	"node_modules/sharp",
];

const ANDROID_NATIVE = [
	{ name: "@napi-rs/canvas-android-arm64", version: "1.0.9", into: "@napi-rs/canvas-android-arm64" },
	{ name: "@resvg/resvg-js-android-arm64", version: "2.6.2", into: "@resvg/resvg-js-android-arm64" },
];

const log = (message) => console.log(`[mobile-runtime] ${message}`);
const exists = (p) => fs.existsSync(p);

function rmrf(target) {
	fs.rmSync(target, { recursive: true, force: true });
}

function download(url, dest) {
	if (exists(dest) && fs.statSync(dest).size > 0) return dest;
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	log(`downloading ${url}`);
	execFileSync("curl", ["-fsSL", "--retry", "3", "--max-time", "900", url, "-o", `${dest}.part`], {
		stdio: "inherit",
	});
	fs.renameSync(`${dest}.part`, dest);
	return dest;
}

/** Debian `ar` archive → { memberName: bytes } (BSD/Linux ar differ on @file). */
function readDeb(file) {
	const data = fs.readFileSync(file);
	if (data.subarray(0, 8).toString() !== "!<arch>\n") throw new Error(`${file} is not a deb`);
	const members = {};
	let offset = 8;
	while (offset + 60 <= data.length) {
		const header = data.subarray(offset, offset + 60).toString();
		const name = header.slice(0, 16).trim().replace(/\/$/, "");
		const size = Number.parseInt(header.slice(48, 58).trim(), 10);
		members[name] = data.subarray(offset + 60, offset + 60 + size);
		offset += 60 + size + (size % 2);
	}
	return members;
}

function extractDeb(deb, target) {
	rmrf(target);
	fs.mkdirSync(target, { recursive: true });
	const members = readDeb(deb);
	const tarball = path.join(CACHE, `${path.basename(deb)}.data.tar.xz`);
	fs.writeFileSync(tarball, members["data.tar.xz"]);
	execFileSync("tar", ["-xJf", tarball, "-C", target]);
	fs.rmSync(tarball);
	return target;
}

/** The Termux package index, resolved by name so mirror version bumps keep working. */
function resolveTermuxFiles() {
	const index = download(`${MIRROR}dists/stable/main/binary-aarch64/Packages`, path.join(CACHE, "Packages"));
	const byName = new Map();
	for (const block of fs.readFileSync(index, "utf8").split("\n\n")) {
		if (!block.trim()) continue;
		const fields = {};
		for (const line of block.split("\n")) {
			const at = line.indexOf(": ");
			if (at > 0) fields[line.slice(0, at)] = line.slice(at + 2);
		}
		if (fields.Package && fields.Filename) byName.set(fields.Package, fields.Filename);
	}
	// `nodejs-lts` is an alias package; its payload lives in the versioned name.
	const versions = { "nodejs-lts": "nodejs-lts" };
	const files = {};
	for (const name of TERMUX_PACKAGES) {
		const filename = byName.get(name) ?? byName.get(versions[name]);
		if (!filename) throw new Error(`Termux package ${name} not found in the mirror index`);
		files[name] = filename;
	}
	return files;
}

function ensureNode() {
	const nodeBin = path.join(CACHE, "node");
	const libDir = path.join(CACHE, "lib");
	if (exists(nodeBin) && exists(libDir)) return { nodeBin, libDir };

	const files = resolveTermuxFiles();
	const usrLib = [];
	for (const [name, filename] of Object.entries(files)) {
		const deb = download(`${MIRROR}${filename}`, path.join(CACHE, "debs", `${name}.deb`));
		const tree = extractDeb(deb, path.join(CACHE, "debs", name));
		const found = path.join(tree, "data/data/com.termux/files/usr");
		if (name === "nodejs-lts") {
			fs.copyFileSync(path.join(found, "bin/node"), nodeBin);
			fs.chmodSync(nodeBin, 0o755);
		}
		usrLib.push(path.join(found, "lib"));
	}

	rmrf(libDir);
	fs.mkdirSync(libDir, { recursive: true });
	for (const dir of usrLib) {
		if (!exists(dir)) continue;
		for (const name of NODE_LIBS) {
			const source = path.join(dir, name);
			// stat (not lstat) so Termux's `libicu.so.79 -> libicu.so.79.1`
			// symlinks resolve to the real payload under their soname.
			if (!exists(source) || !fs.statSync(source).isFile()) continue;
			fs.copyFileSync(source, path.join(libDir, name));
		}
	}
	const missing = NODE_LIBS.filter((lib) => !exists(path.join(libDir, lib)));
	if (missing.length) throw new Error(`Termux payload is missing Node's shared libraries: ${missing.join(", ")}`);
	return { nodeBin, libDir };
}

function ensureAndroidNative() {
	const out = [];
	for (const pkg of ANDROID_NATIVE) {
		const dir = path.join(CACHE, "npm", pkg.into);
		if (!exists(path.join(dir, "package.json"))) {
			rmrf(dir);
			fs.mkdirSync(path.dirname(dir), { recursive: true });
			const tarball = path.join(CACHE, "npm", `${pkg.name.replace("/", "-")}.tgz`);
			download(`https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split("/")[1]}-${pkg.version}.tgz`, tarball);
			execFileSync("tar", ["-xzf", tarball, "-C", path.dirname(dir)]);
			fs.renameSync(path.join(path.dirname(dir), "package"), dir);
		}
		out.push({ dir, into: pkg.into });
	}
	return out;
}

function stageServer({ libDir, androidNative }) {
	rmrf(STAGE);
	log("staging standalone tree");
	fs.cpSync(STANDALONE, STAGE, {
		recursive: true,
		dereference: true,
		filter: (source) => {
			const rel = path.relative(STANDALONE, source);
			if (!rel) return true;
			if (rel.split(path.sep).includes(".DS_Store")) return false;
			return !EXCLUDE.some((skip) => rel === skip || rel.startsWith(`${skip}${path.sep}`));
		},
	});
	for (const native of androidNative) {
		fs.cpSync(native.dir, path.join(STAGE, "node_modules", native.into), { recursive: true, dereference: true });
	}
	fs.cpSync(libDir, path.join(STAGE, "runtime", "lib"), { recursive: true, dereference: true });
}

/** Deterministic-enough ZIP writer (deflate) — avoids depending on the host's `zip`. */
function writeZip(fromDir, outFile) {
	const entries = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const abs = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(abs);
			else if (entry.isFile()) entries.push(abs);
		}
	};
	walk(fromDir);
	entries.sort();

	const chunks = [];
	const central = [];
	let offset = 0;
	for (const file of entries) {
		const name = path.relative(fromDir, file).split(path.sep).join("/");
		const raw = fs.readFileSync(file);
		const crc = zlib.crc32(raw);
		const body = zlib.deflateRawSync(raw, { level: 9 });
		const nameBuf = Buffer.from(name, "utf8");

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6); // UTF-8 names
		local.writeUInt16LE(8, 8); // deflate
		local.writeUInt16LE(0, 10);
		local.writeUInt16LE(0x21, 12); // 1980-01-01, fixed for reproducibility
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28);
		chunks.push(local, nameBuf, body);

		const entry = Buffer.alloc(46);
		entry.writeUInt32LE(0x02014b50, 0);
		entry.writeUInt16LE(20, 4);
		entry.writeUInt16LE(20, 6);
		entry.writeUInt16LE(0x0800, 8);
		entry.writeUInt16LE(8, 10);
		entry.writeUInt16LE(0, 12);
		entry.writeUInt16LE(0x21, 14);
		entry.writeUInt32LE(crc, 16);
		entry.writeUInt32LE(body.length, 20);
		entry.writeUInt32LE(raw.length, 24);
		entry.writeUInt16LE(nameBuf.length, 28);
		entry.writeUInt32LE(offset, 42);
		central.push(entry, nameBuf);

		offset += local.length + nameBuf.length + body.length;
	}
	const directory = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	fs.mkdirSync(path.dirname(outFile), { recursive: true });
	fs.writeFileSync(outFile, Buffer.concat([...chunks, directory, end]));
	return { files: entries.length, bytes: fs.statSync(outFile).size };
}

const main = () => {
	if (!exists(path.join(STANDALONE, "server.js"))) {
		throw new Error(`.next/standalone/server.js missing — run \`npm run build\` and \`node scripts/build-server.mjs\` in ${ROOT}`);
	}
	const { nodeBin, libDir } = ensureNode();
	const androidNative = ensureAndroidNative();
	stageServer({ libDir, androidNative });

	const jniDir = path.join(JNI_OUT, "arm64-v8a");
	fs.mkdirSync(jniDir, { recursive: true });
	fs.copyFileSync(nodeBin, path.join(jniDir, "liblh-node.so"));

	const zip = writeZip(STAGE, path.join(ASSETS_OUT, "lh-server.zip"));
	log(`server payload: ${zip.files} files, ${(zip.bytes / 1024 / 1024).toFixed(1)} MB`);
	log(`node executable: ${(fs.statSync(nodeBin).size / 1024 / 1024).toFixed(1)} MB`);
	log(`host: ${os.platform()}/${os.arch()}`);
};

main();
