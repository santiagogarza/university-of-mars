import type { Entrance, Place, WalkEdge, WalkNode } from '../data/campus-map';

export type RouteStep = { text: string; meters: number };

export type Route = {
  /** Map points from the first entrance to the last, in order. */
  points: { x: number; y: number }[];
  meters: number;
  minutes: number;
  from: Entrance;
  to: Entrance;
  steps: RouteStep[];
  usesStairs: boolean;
};

export type RouteOptions = { stepFree?: boolean; metersPerUnit?: number; metersPerMinute?: number };

type Link = { to: string; edge: WalkEdge; length: number };

type Graph = { nodes: Map<string, WalkNode>; links: Map<string, Link[]> };

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function buildGraph(nodes: WalkNode[], edges: WalkEdge[]): Graph {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const links = new Map<string, Link[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) throw new Error(`Walk edge ${edge.from}–${edge.to} names a missing node.`);
    const length = distance(a, b);
    links.get(a.id)?.push({ to: b.id, edge, length });
    links.get(b.id)?.push({ to: a.id, edge, length });
  }
  return { nodes: byId, links };
}

/** Shortest node path from start to goal, or null when they are not connected. */
export function shortestPath(
  graph: Graph,
  start: string,
  goal: string,
  stepFree = false,
): { ids: string[]; edges: WalkEdge[]; length: number } | null {
  const dist = new Map<string, number>([[start, 0]]);
  const prev = new Map<string, { id: string; edge: WalkEdge }>();
  const open = new Set<string>([start]);
  const done = new Set<string>();

  while (open.size) {
    let current = '';
    let best = Infinity;
    for (const id of open) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        current = id;
      }
    }
    open.delete(current);
    if (current === goal) break;
    done.add(current);
    for (const link of graph.links.get(current) ?? []) {
      if (done.has(link.to)) continue;
      if (stepFree && link.edge.stairs) continue;
      const next = best + link.length;
      if (next < (dist.get(link.to) ?? Infinity)) {
        dist.set(link.to, next);
        prev.set(link.to, { id: current, edge: link.edge });
        open.add(link.to);
      }
    }
  }

  if (!dist.has(goal)) return null;
  const ids = [goal];
  const edges: WalkEdge[] = [];
  let cursor = goal;
  while (cursor !== start) {
    const step = prev.get(cursor);
    if (!step) return null;
    ids.unshift(step.id);
    edges.unshift(step.edge);
    cursor = step.id;
  }
  return { ids, edges, length: dist.get(goal) ?? 0 };
}

function compass(dx: number, dy: number): string {
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const names = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];
  const index = Math.round(((angle + 360) % 360) / 45) % 8;
  return names[index] as string;
}

const roundMeters = (m: number) => Math.max(10, Math.round(m / 10) * 10);

export function walkingMinutes(meters: number, metersPerMinute = 80): number {
  return Math.max(1, Math.round(meters / metersPerMinute));
}

/** Best route between two places, trying every usable entrance on each end. */
export function findRoute(
  graph: Graph,
  from: Place,
  to: Place,
  { stepFree = false, metersPerUnit = 1, metersPerMinute = 80 }: RouteOptions = {},
): Route | null {
  if (from.id === to.id) return null;
  const usable = (place: Place) => {
    const doors = place.entrances.filter((e) => !stepFree || e.stepFree);
    return doors.length ? doors : place.entrances;
  };

  let best: { length: number; a: Entrance; b: Entrance; path: NonNullable<ReturnType<typeof shortestPath>> } | null =
    null;
  for (const a of usable(from)) {
    for (const b of usable(to)) {
      const path = shortestPath(graph, a.node, b.node, stepFree);
      const nodeA = graph.nodes.get(a.node);
      const nodeB = graph.nodes.get(b.node);
      if (!path || !nodeA || !nodeB) continue;
      const length = distance(a, nodeA) + path.length + distance(nodeB, b);
      if (!best || length < best.length) best = { length, a, b, path };
    }
  }
  if (!best) return null;

  const { a, b, path } = best;
  const nodePoints = path.ids.map((id) => graph.nodes.get(id) as WalkNode);
  const points = [{ x: a.x, y: a.y }, ...nodePoints.map(({ x, y }) => ({ x, y })), { x: b.x, y: b.y }];
  const meters = best.length * metersPerUnit;

  const steps: RouteStep[] = [];
  const leave = a.plaza ? `Start at ${from.name}` : `Leave ${from.name} by the ${a.label.replace(/ \(.*\)$/, '').toLowerCase()}`;
  steps.push({ text: leave, meters: Math.round(distance(a, nodePoints[0] as WalkNode) * metersPerUnit) });

  let i = 0;
  while (i < path.edges.length) {
    const name = path.edges[i]?.name as string;
    const stairs = Boolean(path.edges[i]?.stairs);
    let j = i;
    let length = 0;
    while (j < path.edges.length && path.edges[j]?.name === name) {
      length += distance(nodePoints[j] as WalkNode, nodePoints[j + 1] as WalkNode);
      j += 1;
    }
    const start = nodePoints[i] as WalkNode;
    const end = nodePoints[j] as WalkNode;
    const m = length * metersPerUnit;
    const verb = steps.length === 1 ? 'Head' : 'Continue';
    const note = stairs ? ' (steps)' : '';
    steps.push({
      text: `${verb} ${compass(end.x - start.x, end.y - start.y)} on ${name}${note} for about ${roundMeters(m)} m`,
      meters: Math.round(m),
    });
    i = j;
  }

  const arrive = b.plaza ? `Arrive at ${to.name}` : `Arrive at ${to.name}, ${b.label.replace(/ \(.*\)$/, '').toLowerCase()}`;
  steps.push({ text: arrive, meters: Math.round(distance(nodePoints.at(-1) as WalkNode, b) * metersPerUnit) });

  return {
    points,
    meters,
    minutes: walkingMinutes(meters, metersPerMinute),
    from: a,
    to: b,
    steps,
    usesStairs: path.edges.some((edge) => edge.stairs) || !a.stepFree || !b.stepFree,
  };
}

export function placeMatches(place: Place, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = `${place.name} ${place.label.join(' ')} ${place.departments.join(' ')} ${place.keywords}`.toLowerCase();
  return needle.split(/\s+/).every((part) => haystack.includes(part));
}

export const hasStepFreeDoor = (place: Place) => place.entrances.some((e) => e.stepFree && (!e.plaza || place.kind === 'stop'));
