import type { MerkleProofNode } from "./models";

const encoder = new TextEncoder();
type BinaryInput = ArrayBuffer | ArrayBufferView;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not support non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value}.`);
}

export async function sha256Hex(payload: BinaryInput | string) {
  const bytes = typeof payload === "string" ? encoder.encode(payload) : toUint8Array(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function computeAssetId(manifestWithoutAssetId: Record<string, unknown>) {
  return sha256Hex(canonicalJson(manifestWithoutAssetId));
}

export async function hashAssetUnit(unitIndex: number, payload: BinaryInput) {
  if (!Number.isInteger(unitIndex) || unitIndex < 0 || unitIndex > 0xffff_ffff) {
    throw new RangeError("Asset unit index must be an unsigned 32-bit integer.");
  }
  const payloadBytes = toUint8Array(payload);
  const leaf = new Uint8Array(5 + payloadBytes.byteLength);
  leaf[0] = 0;
  new DataView(leaf.buffer).setUint32(1, unitIndex, false);
  leaf.set(payloadBytes, 5);
  return sha256Hex(leaf);
}

export async function buildMerkleTree(leafHashes: readonly string[]) {
  if (leafHashes.length === 0) {
    throw new RangeError("A Merkle tree requires at least one leaf.");
  }

  const levels: string[][] = [[...leafHashes]];
  while (levels[levels.length - 1]!.length > 1) {
    const current = levels[levels.length - 1]!;
    const next: string[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index]!;
      const right = current[index + 1] ?? left;
      next.push(await hashMerkleNode(left, right));
    }
    levels.push(next);
  }

  return {
    root: levels[levels.length - 1]![0]!,
    proofs: leafHashes.map((_, unitIndex) => buildProof(levels, unitIndex))
  };
}

export async function verifyAssetUnit(input: {
  unitIndex: number;
  payload: BinaryInput;
  contentHash: string;
  proof: readonly MerkleProofNode[];
  merkleRoot: string;
}) {
  let current = await hashAssetUnit(input.unitIndex, input.payload);
  if (current !== input.contentHash) {
    return false;
  }
  for (const node of input.proof) {
    current = node.position === "left"
      ? await hashMerkleNode(node.hash, current)
      : await hashMerkleNode(current, node.hash);
  }
  return current === input.merkleRoot;
}

async function hashMerkleNode(left: string, right: string) {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  const node = new Uint8Array(1 + leftBytes.byteLength + rightBytes.byteLength);
  node[0] = 1;
  node.set(leftBytes, 1);
  node.set(rightBytes, 1 + leftBytes.byteLength);
  return sha256Hex(node);
}

function buildProof(levels: readonly string[][], unitIndex: number): MerkleProofNode[] {
  const proof: MerkleProofNode[] = [];
  let index = unitIndex;
  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    const level = levels[levelIndex]!;
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    proof.push({
      position: isRight ? "left" : "right",
      hash: level[siblingIndex] ?? level[index]!
    });
    index = Math.floor(index / 2);
  }
  return proof;
}

function toUint8Array(payload: BinaryInput): Uint8Array<ArrayBuffer> {
  const source = payload instanceof ArrayBuffer
    ? new Uint8Array(payload)
    : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError("Expected a lowercase SHA-256 hex digest.");
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}
