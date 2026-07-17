import { describe, it, expect } from "vitest";
import { computeGraphLayout } from "./graphLayout";

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("computeGraphLayout", () => {
  it("returns finite coordinates for all nodes and includes every input node/edge without loss or duplication", () => {
    const nodes = [
      { id: "a", title: "本A" },
      { id: "b", title: "本B" },
      { id: "c", title: "本C" },
      { id: "d", title: "本D（孤立ノード）" },
    ];
    const links = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
    ];

    const layout = computeGraphLayout(nodes, links);

    expect(layout.nodes).toHaveLength(nodes.length);
    for (const inputNode of nodes) {
      const positioned = layout.nodes.find((n) => n.id === inputNode.id);
      expect(positioned).toBeTruthy();
      expect(positioned?.title).toBe(inputNode.title);
      expect(Number.isFinite(positioned?.x)).toBe(true);
      expect(Number.isFinite(positioned?.y)).toBe(true);
    }

    expect(layout.links).toHaveLength(links.length);
    for (const inputLink of links) {
      const positioned = layout.links.find(
        (l) => l.source === inputLink.source && l.target === inputLink.target
      );
      expect(positioned).toBeTruthy();
      expect(Number.isFinite(positioned?.x1)).toBe(true);
      expect(Number.isFinite(positioned?.y1)).toBe(true);
      expect(Number.isFinite(positioned?.x2)).toBe(true);
      expect(Number.isFinite(positioned?.y2)).toBe(true);
    }
  });

  it("keeps linked nodes closer together than an unrelated isolated node (force-directed clustering tendency)", () => {
    // a-b-c は三角形状に密結合させ、dは完全に孤立させる。
    // 力学シミュレーションの性質上、リンクで結ばれたクラスタ同士は forceLink の
    // 収束距離に近い間隔にまとまり、孤立ノードは charge（反発力）だけで押し出されるため、
    // クラスタ内の平均距離よりクラスタ-孤立ノード間の距離の方が大きくなる傾向がある。
    const nodes = [
      { id: "a", title: "本A" },
      { id: "b", title: "本B" },
      { id: "c", title: "本C" },
      { id: "d", title: "本D（孤立）" },
    ];
    const links = [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "a", target: "c" },
    ];

    const layout = computeGraphLayout(nodes, links);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const a = byId.get("a")!;
    const b = byId.get("b")!;
    const c = byId.get("c")!;
    const d = byId.get("d")!;

    const withinClusterDistances = [distance(a, b), distance(b, c), distance(a, c)];
    const avgWithinCluster =
      withinClusterDistances.reduce((sum, v) => sum + v, 0) / withinClusterDistances.length;

    const toIsolatedDistances = [distance(a, d), distance(b, d), distance(c, d)];
    const avgToIsolated =
      toIsolatedDistances.reduce((sum, v) => sum + v, 0) / toIsolatedDistances.length;

    expect(avgToIsolated).toBeGreaterThan(avgWithinCluster);
  });

  it("handles zero books without crashing", () => {
    const layout = computeGraphLayout([], []);
    expect(layout.nodes).toEqual([]);
    expect(layout.links).toEqual([]);
  });

  it("handles a single book with no links without crashing", () => {
    const layout = computeGraphLayout([{ id: "solo", title: "1冊だけの本" }], []);
    expect(layout.nodes).toHaveLength(1);
    expect(Number.isFinite(layout.nodes[0].x)).toBe(true);
    expect(Number.isFinite(layout.nodes[0].y)).toBe(true);
    expect(layout.links).toEqual([]);
  });

  it("excludes a link that references a book id not present in the nodes list, without crashing", () => {
    const nodes = [
      { id: "a", title: "本A" },
      { id: "b", title: "本B" },
    ];
    // "missing" は nodes に存在しない id（データ不整合を想定した入力）。
    const links = [
      { source: "a", target: "b" },
      { source: "a", target: "missing" },
    ];

    const layout = computeGraphLayout(nodes, links);
    expect(layout.links).toHaveLength(1);
    expect(layout.links[0]).toMatchObject({ source: "a", target: "b" });
  });

  it("passes each link's strength through to the output unchanged, and defaults to 2 (normal) when omitted", () => {
    const nodes = [
      { id: "a", title: "本A" },
      { id: "b", title: "本B" },
      { id: "c", title: "本C" },
      { id: "d", title: "本D" },
    ];
    const links = [
      { source: "a", target: "b", strength: 1 },
      { source: "b", target: "c", strength: 3 },
      { source: "c", target: "d" }, // strength省略 → デフォルト(2)になるはず
    ];

    const layout = computeGraphLayout(nodes, links);
    const byPair = new Map(layout.links.map((l) => [`${l.source}-${l.target}`, l]));

    expect(byPair.get("a-b")?.strength).toBe(1);
    expect(byPair.get("b-c")?.strength).toBe(3);
    expect(byPair.get("c-d")?.strength).toBe(2);
  });

  it("does not let strength influence the computed layout (coordinates are identical regardless of strength values)", () => {
    // トポロジー（ノード・リンクの接続関係）は同一で、strengthだけを変えた2通りの入力を用意する。
    // strengthはpage.tsx側の見た目（線の太さ・色）のためだけのデータであり、d3-forceの
    // 座標計算（forceLinkのdistance等）には一切使われないはず、という仕様を確認する。
    const nodes = [
      { id: "a", title: "本A" },
      { id: "b", title: "本B" },
      { id: "c", title: "本C" },
    ];

    const layoutWeak = computeGraphLayout(nodes, [
      { source: "a", target: "b", strength: 1 },
      { source: "b", target: "c", strength: 1 },
    ]);
    const layoutStrong = computeGraphLayout(nodes, [
      { source: "a", target: "b", strength: 3 },
      { source: "b", target: "c", strength: 3 },
    ]);

    expect(layoutStrong.nodes).toEqual(layoutWeak.nodes);
    expect(
      layoutStrong.links.map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 }))
    ).toEqual(layoutWeak.links.map(({ x1, y1, x2, y2 }) => ({ x1, y1, x2, y2 })));
  });
});
