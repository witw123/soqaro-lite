import { describe, expect, it } from "vitest";
import {
  buildMerkleTree,
  canonicalJson,
  computeAssetId,
  hashAssetUnit,
  verifyAssetUnit
} from "./integrity";

describe("asset integrity", () => {
  it("canonicalizes objects recursively", () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: "ok" }, skip: undefined })).toBe(
      '{"a":{"x":"ok","y":true},"z":1}'
    );
  });

  it("computes the same asset id regardless of key insertion order", async () => {
    await expect(computeAssetId({ kind: "original", unitCount: 2 })).resolves.toBe(
      await computeAssetId({ unitCount: 2, kind: "original" })
    );
  });

  it("verifies units and rejects payload or proof tampering", async () => {
    const payloads = [new Uint8Array([1, 2]), new Uint8Array([3, 4]), new Uint8Array([5])];
    const leaves = await Promise.all(payloads.map((payload, index) => hashAssetUnit(index, payload)));
    const tree = await buildMerkleTree(leaves);

    await expect(verifyAssetUnit({
      unitIndex: 1,
      payload: payloads[1]!,
      contentHash: leaves[1]!,
      proof: tree.proofs[1]!,
      merkleRoot: tree.root
    })).resolves.toBe(true);

    await expect(verifyAssetUnit({
      unitIndex: 1,
      payload: new Uint8Array([3, 9]),
      contentHash: leaves[1]!,
      proof: tree.proofs[1]!,
      merkleRoot: tree.root
    })).resolves.toBe(false);

    const tamperedProof = tree.proofs[1]!.map((node, index) =>
      index === 0 ? { ...node, hash: "0".repeat(64) } : node
    );
    await expect(verifyAssetUnit({
      unitIndex: 1,
      payload: payloads[1]!,
      contentHash: leaves[1]!,
      proof: tamperedProof,
      merkleRoot: tree.root
    })).resolves.toBe(false);
  });
});
