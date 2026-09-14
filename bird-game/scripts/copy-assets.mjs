import { cp, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const wasmSrc = resolve(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDest = resolve(root, "public/wasm");
const modelSrc = resolve(root, "../models/pose_landmarker_lite.task");
const modelDest = resolve(root, "public/models/pose_landmarker_lite.task");

const exists = async (p) => access(p).then(() => true, () => false);

await mkdir(resolve(root, "public/models"), { recursive: true });
await cp(wasmSrc, wasmDest, { recursive: true });

if (await exists(modelSrc)) {
  await cp(modelSrc, modelDest);
} else if (!(await exists(modelDest))) {
  const url =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(modelDest, Buffer.from(await res.arrayBuffer()));
}

console.log("assets ready: public/wasm, public/models");
