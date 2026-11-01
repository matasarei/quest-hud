// A picture as an Svg document, for the desktop app: one element per shape,
// gradients shared. Pure.
import type { Fill, Picture, Shape } from './picture'

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`
const n = (value: number): string => String(Math.round(value * 100) / 100)

/** The picture on a `unitsWide × unitsHigh` canvas, each unit `scale` CSS pixels, over `background`. */
export const pictureToSvg = (picture: Picture, unitsWide: number, unitsHigh: number, background = 0, scale = 1): string => {
  const gradients = new Map<string, { id: string; def: string }>()

  const paint = (fill: Fill): string => {
    if (typeof fill === 'number') return hex(fill)
    const key = `${fill.top}-${fill.bottom}-${n(fill.y0)}-${n(fill.y1)}`
    let gradient = gradients.get(key)
    if (gradient === undefined) {
      const id = `g${gradients.size}`
      gradient = {
        id,
        def: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(fill.y0)}" x2="0" y2="${n(fill.y1)}"><stop offset="0" stop-color="${hex(fill.top)}"/><stop offset="1" stop-color="${hex(fill.bottom)}"/></linearGradient>`,
      }
      gradients.set(key, gradient)
    }
    return `url(#${gradient.id})`
  }

  const element = (shape: Shape): string => {
    const style = `fill="${paint(shape.fill)}"${shape.opacity !== undefined && shape.opacity < 1 ? ` fill-opacity="${n(shape.opacity)}"` : ''}`
    switch (shape.kind) {
      case 'rect':
        return `<rect x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.w)}" height="${n(shape.h)}" ${style}/>`
      case 'ellipse':
        return `<ellipse cx="${n(shape.cx)}" cy="${n(shape.cy)}" rx="${n(shape.rx)}" ry="${n(shape.ry)}" ${style}/>`
      case 'polygon':
        return `<polygon points="${shape.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" ${style}/>`
      case 'capsule': {
        const stroke = style.replace('fill=', 'stroke=').replace('fill-opacity=', 'stroke-opacity=')
        return `<line x1="${n(shape.x1)}" y1="${n(shape.y1)}" x2="${n(shape.x2)}" y2="${n(shape.y2)}" stroke-width="${n(shape.r * 2)}" stroke-linecap="round" ${stroke}/>`
      }
      case 'ridge': {
        const end = shape.x0 + shape.dx * (shape.ys.length - 1)
        const top = shape.ys.map((y, i) => `${n(shape.x0 + i * shape.dx)},${n(y)}`).join(' ')
        return `<polygon points="${top} ${n(end)},${n(shape.bottom)} ${n(shape.x0)},${n(shape.bottom)}" ${style}/>`
      }
    }
  }

  const body = picture.map(element).join('')
  const defs = gradients.size > 0 ? `<defs>${[...gradients.values()].map(g => g.def).join('')}</defs>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(unitsWide)} ${n(unitsHigh)}" width="${n(unitsWide * scale)}" height="${n(unitsHigh * scale)}" preserveAspectRatio="none">${defs}<rect width="100%" height="100%" fill="${hex(background)}"/>${body}</svg>`
}
