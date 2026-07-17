import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

/** 相関図（`app/graph/page.tsx`）に渡すノード（本）1件分の入力。 */
export interface GraphNodeInput {
  id: string;
  title: string;
}

/**
 * 相関図に渡すエッジ（リンク）1件分の入力。`book_links`の`from_book_id`/`to_book_id`を
 * `source`/`target`に読み替えるのは呼び出し側（`page.tsx`）の責務とする
 * （`layout.ts`自体はd3-force/グラフ描画の語彙に閉じ、DBのカラム名に依存させないため）。
 *
 * `strength`（関連度、1〜3）は座標計算には一切使わず、`page.tsx`が線の太さ・色を
 * 決めるためだけにそのまま`PositionedGraphLink`まで通過させる値（タスク37）。省略時は
 * `DEFAULT_LINK_STRENGTH`（DB側のデフォルト値と同じ「普通」）を補う。
 */
export interface GraphLinkInput {
  source: string;
  target: string;
  strength?: number;
}

/** `strength`省略時に補うデフォルト値。`book_links.strength`のDB既定値（普通）と合わせる。 */
const DEFAULT_LINK_STRENGTH = 2;

/** レイアウト計算後の、座標が確定したノード。 */
export interface PositionedGraphNode {
  id: string;
  title: string;
  x: number;
  y: number;
}

/** レイアウト計算後の、両端の座標まで確定したエッジ。 */
export interface PositionedGraphLink {
  source: string;
  target: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 関連度（1〜3）。入力の`GraphLinkInput.strength`をそのまま引き継ぐ（省略時はデフォルト値）。 */
  strength: number;
}

export interface GraphLayout {
  nodes: PositionedGraphNode[];
  links: PositionedGraphLink[];
}

/** SVG描画側の`viewBox="0 0 800 600"`と合わせる想定の論理キャンバスサイズ。 */
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

/** ノード間の初期配置（円状）の半径。中心(0,0)基準で、後段の`forceCenter`が実際の中心へ寄せる。 */
const INITIAL_LAYOUT_RADIUS = 100;

/** 静的な最終レイアウトを1回計算するのに十分な、同期tick回数。 */
const SIMULATION_TICKS = 300;

/** リンクで結ばれたノード同士が収束する目安の距離。 */
const LINK_DISTANCE = 120;

/** ノード同士の反発力の強さ（負値ほど強く反発する）。 */
const CHARGE_STRENGTH = -220;

/** ノード同士が重なりすぎないようにする衝突半径。 */
const COLLIDE_RADIUS = 30;

type SimNode = SimulationNodeDatum & GraphNodeInput;

/**
 * d3-forceに渡す内部用のリンク型。`strength`は追加の独自フィールドであり、
 * forceLinkは`source`/`target`しか参照しないため、座標計算には影響しない
 * （forceLinkの`.strength()`メソッド＝リンク力全体の強さの調整とは無関係。
 * 混同しないよう、こちらは単なるデータの持ち回り用のプロパティ名）。
 */
type SimLink = SimulationLinkDatum<SimNode> & { strength: number };

/**
 * 本（ノード）とリンク（エッジ）の入力から、d3-forceの力学シミュレーションを使って
 * 各ノードの最終座標（および各エッジの両端座標）を計算する純粋関数。
 *
 * Reactコンポーネント（`page.tsx`）から分離しているのは、DOM無しでVitestから
 * ユニットテストできるようにするため。乱数（`Math.random()`によるd3-forceの既定の
 * 初期ジッター）に依存するとテストの再現性が損なわれるため、各ノードには呼び出しの
 * たびに同じ結果になる決定論的な初期位置（インデックスに基づく円状配置）を与えてから
 * シミュレーションを実行する。
 *
 * アニメーションのような継続的な再描画は行わず、`forceSimulation`生成直後に`.stop()`して
 * `tick()`を固定回数呼ぶ同期的な計算方式にしている（静的なレイアウトを1回計算するだけで
 * 足りるため）。
 */
export function computeGraphLayout(
  nodesInput: GraphNodeInput[],
  linksInput: GraphLinkInput[]
): GraphLayout {
  const nodeCount = nodesInput.length;

  const simNodes: SimNode[] = nodesInput.map((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(nodeCount, 1);
    return {
      id: node.id,
      title: node.title,
      x: INITIAL_LAYOUT_RADIUS * Math.cos(angle),
      y: INITIAL_LAYOUT_RADIUS * Math.sin(angle),
    };
  });

  const validNodeIds = new Set(nodesInput.map((node) => node.id));
  // d3-forceのforceLinkは、参照先のidがノード集合に存在しないとエラーを投げるため、
  // データ不整合（存在しない本を指すリンク）を事前に除外してから渡す。
  const simLinks: SimLink[] = linksInput
    .filter((link) => validNodeIds.has(link.source) && validNodeIds.has(link.target))
    .map((link) => ({
      source: link.source,
      target: link.target,
      strength: link.strength ?? DEFAULT_LINK_STRENGTH,
    }));

  if (nodeCount > 0) {
    const simulation = forceSimulation(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((node) => node.id)
          .distance(LINK_DISTANCE)
      )
      .force("charge", forceManyBody().strength(CHARGE_STRENGTH))
      .force("center", forceCenter(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2))
      .force("collide", forceCollide(COLLIDE_RADIUS))
      .stop();

    for (let i = 0; i < SIMULATION_TICKS; i++) {
      simulation.tick();
    }
  }

  const positionedNodes: PositionedGraphNode[] = simNodes.map((node) => ({
    id: node.id,
    title: node.title,
    x: node.x ?? 0,
    y: node.y ?? 0,
  }));

  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));

  const positionedLinks: PositionedGraphLink[] = simLinks.reduce<PositionedGraphLink[]>(
    (acc, link) => {
      // forceLinkはシミュレーション実行後、link.source/targetをid文字列からノード
      // オブジェクトそのものへ差し替える（d3-forceの既定の挙動）。念のため両方の
      // 形（文字列のまま/オブジェクト化済み）に対応する。
      const sourceId =
        typeof link.source === "object" ? (link.source as SimNode).id : (link.source as string);
      const targetId =
        typeof link.target === "object" ? (link.target as SimNode).id : (link.target as string);

      const sourceNode = nodeById.get(sourceId);
      const targetNode = nodeById.get(targetId);
      if (!sourceNode || !targetNode) {
        // 存在しない本を指すリンク（データ不整合）は描画対象から除外する。
        return acc;
      }

      acc.push({
        source: sourceId,
        target: targetId,
        x1: sourceNode.x,
        y1: sourceNode.y,
        x2: targetNode.x,
        y2: targetNode.y,
        strength: link.strength,
      });
      return acc;
    },
    []
  );

  return { nodes: positionedNodes, links: positionedLinks };
}
