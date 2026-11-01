// A picture drawn in code: shapes in scene units, painted in order. A unit is
// one column across and half a row down, so a scene is `columns × 28` units
// whatever it is drawn as — cells, an image at a finer scale, or an Svg. Pure.

/** A colour, `0xrrggbb`, or a vertical gradient from `top` at `y0` to `bottom` at `y1`. */
export type Fill = number | { top: number; bottom: number; y0: number; y1: number }

type Paint = { fill: Fill; opacity?: number }

export type Shape = Paint &
  (
    | { kind: 'rect'; x: number; y: number; w: number; h: number }
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
    | { kind: 'polygon'; points: ReadonlyArray<readonly [number, number]> }
    /** A rounded line: every point within `r` of the segment. */
    | { kind: 'capsule'; x1: number; y1: number; x2: number; y2: number; r: number }
    /**
     * A skyline filled down to `bottom`: `ys[i]` is its height at `x0 + i × dx`,
     * straight between. Hills and silhouettes, cheap to fill however wide.
     */
    | { kind: 'ridge'; x0: number; dx: number; ys: readonly number[]; bottom: number }
  )

export type Picture = readonly Shape[]

const moveFill = (fill: Fill, dy: number): Fill =>
  typeof fill === 'number' ? fill : { ...fill, y0: fill.y0 + dy, y1: fill.y1 + dy }

/** The picture moved by `dx`, `dy` units. */
export const translate = (picture: Picture, dx: number, dy: number): Shape[] =>
  picture.map((shape): Shape => {
    const fill = moveFill(shape.fill, dy)
    switch (shape.kind) {
      case 'rect':
        return { ...shape, fill, x: shape.x + dx, y: shape.y + dy }
      case 'ellipse':
        return { ...shape, fill, cx: shape.cx + dx, cy: shape.cy + dy }
      case 'polygon':
        return { ...shape, fill, points: shape.points.map(([x, y]) => [x + dx, y + dy] as const) }
      case 'capsule':
        return { ...shape, fill, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy }
      case 'ridge':
        return { ...shape, fill, x0: shape.x0 + dx, ys: shape.ys.map(y => y + dy), bottom: shape.bottom + dy }
    }
  })

/** The picture flipped left to right about the line x = `axis`. */
export const mirror = (picture: Picture, axis: number): Shape[] =>
  picture.map((shape): Shape => {
    const flip = (x: number): number => 2 * axis - x
    switch (shape.kind) {
      case 'rect':
        return { ...shape, x: flip(shape.x + shape.w) }
      case 'ellipse':
        return { ...shape, cx: flip(shape.cx) }
      case 'polygon':
        return { ...shape, points: shape.points.map(([x, y]) => [flip(x), y] as const) }
      case 'capsule':
        return { ...shape, x1: flip(shape.x1), x2: flip(shape.x2) }
      case 'ridge': {
        const end = shape.x0 + shape.dx * (shape.ys.length - 1)
        return { ...shape, x0: flip(end), ys: [...shape.ys].reverse() }
      }
    }
  })

/** The box a shape covers, in units: [left, top, right, bottom]. */
export const bounds = (shape: Shape): readonly [number, number, number, number] => {
  switch (shape.kind) {
    case 'rect':
      return [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h]
    case 'ellipse':
      return [shape.cx - shape.rx, shape.cy - shape.ry, shape.cx + shape.rx, shape.cy + shape.ry]
    case 'polygon': {
      const xs = shape.points.map(([x]) => x)
      const ys = shape.points.map(([, y]) => y)
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    }
    case 'capsule':
      return [
        Math.min(shape.x1, shape.x2) - shape.r, Math.min(shape.y1, shape.y2) - shape.r,
        Math.max(shape.x1, shape.x2) + shape.r, Math.max(shape.y1, shape.y2) + shape.r,
      ]
    case 'ridge':
      return [shape.x0, Math.min(...shape.ys), shape.x0 + shape.dx * (shape.ys.length - 1), shape.bottom]
  }
}

/** Whether the point (u, v), in units, is inside the shape. */
export const contains = (shape: Shape, u: number, v: number): boolean => {
  switch (shape.kind) {
    case 'rect':
      return u >= shape.x && u < shape.x + shape.w && v >= shape.y && v < shape.y + shape.h
    case 'ellipse': {
      const a = (u - shape.cx) / shape.rx
      const b = (v - shape.cy) / shape.ry
      return a * a + b * b <= 1
    }
    case 'polygon': {
      let inside = false
      const p = shape.points
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i] as readonly [number, number]
        const [xj, yj] = p[j] as readonly [number, number]
        if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside
      }
      return inside
    }
    case 'capsule': {
      const dx = shape.x2 - shape.x1
      const dy = shape.y2 - shape.y1
      const length = dx * dx + dy * dy
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((u - shape.x1) * dx + (v - shape.y1) * dy) / length))
      const ex = u - (shape.x1 + t * dx)
      const ey = v - (shape.y1 + t * dy)
      return ex * ex + ey * ey <= shape.r * shape.r
    }
    case 'ridge': {
      if (v > shape.bottom) return false
      const at = (u - shape.x0) / shape.dx
      const i = Math.floor(at)
      if (i < 0 || i >= shape.ys.length - 1) return false
      const y0 = shape.ys[i] as number
      const y1 = shape.ys[i + 1] as number
      return v >= y0 + (y1 - y0) * (at - i)
    }
  }
}

/** A fill's colour at height `v`, in units. */
export const colorAt = (fill: Fill, v: number): number => {
  if (typeof fill === 'number') return fill
  const t = fill.y1 === fill.y0 ? 0 : Math.max(0, Math.min(1, (v - fill.y0) / (fill.y1 - fill.y0)))
  return mixColor(fill.top, fill.bottom, t)
}

/** `a` moved toward `b` by `t` (0 to 1), channel by channel. */
export const mixColor = (a: number, b: number, t: number): number => {
  const channel = (shift: number): number => {
    const x = (a >> shift) & 255
    const y = (b >> shift) & 255
    return Math.round(x + (y - x) * t) << shift
  }
  return channel(16) | channel(8) | channel(0)
}
