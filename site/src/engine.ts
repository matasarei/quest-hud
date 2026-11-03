// What the engine is to the mod's layouts, in a browser: `h` builds DOM, and
// `$.ui.resolve()` names the elements hooks/pane.tsx, board.tsx and band.tsx draw
// with. Their text goes in as text, never as markup: the mod's rule on outside
// text, and the only path anything a visitor types can take onto the page.
import type { EngineInterface } from 'claude-code'

import { DEFAULT_COLOR } from '../../plugins/quest-hud/src/avatar'
import { cellPixels } from './cells'

type Props = Readonly<Record<string, unknown>>
type Child = Node | string | number | boolean | null | undefined | readonly Child[]
type Element = (props: Props, children: readonly Child[]) => Node

const append = (parent: Node, children: readonly Child[]): void => {
  for (const child of children) {
    if (Array.isArray(child)) append(parent, child as readonly Child[])
    else if (child instanceof Node) parent.appendChild(child)
    else if (typeof child === 'string' || typeof child === 'number') parent.appendChild(document.createTextNode(String(child)))
  }
}

/** The elements a blit can reach, by the key the layout gave them. */
const drawn = new Map<string, HTMLElement>()

const remember = <T extends HTMLElement>(key: unknown, element: T): T => {
  if (typeof key === 'string') drawn.set(key, element)
  return element
}

const paint = (canvas: HTMLCanvasElement, cells: string, columns: number, rows: number): void => {
  const pixels = cellPixels(cells, columns, rows, DEFAULT_COLOR)
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, columns * 2, rows * 2), 0, 0)
}

const pngUrl = (source: unknown): string => `data:image/png;base64,${(source as { png: string }).png}`

/** Sizes a scene as a terminal would, in the text's own cells. */
const sizeInCells = (element: HTMLElement, columns: number, rows: number): void => {
  element.style.width = `${columns}ch`
  element.style.height = `calc(${rows} * var(--line))`
}

const Box: Element = (props, children) => {
  const box = document.createElement('div')
  box.className = 'box'
  box.style.flexDirection = props.flexDirection === 'column' ? 'column' : 'row'
  if (typeof props.justifyContent === 'string') box.style.justifyContent = props.justifyContent
  if (typeof props.alignItems === 'string') box.style.alignItems = props.alignItems
  if (typeof props.gap === 'number') box.style.gap = `${props.gap}ch`
  if (typeof props.marginTop === 'number') box.style.marginTop = `calc(${props.marginTop} * var(--line))`
  if (typeof props.flexGrow === 'number') box.style.flexGrow = String(props.flexGrow)
  if (typeof props.flexShrink === 'number') box.style.flexShrink = String(props.flexShrink)
  append(box, children)
  return box
}

const Text: Element = (props, children) => {
  const text = document.createElement('span')
  text.className = props.wrap === 'truncate-end' ? 'text truncate' : 'text'
  if (typeof props.color === 'string') text.style.color = props.color
  if (props.dimColor === true) text.classList.add('dim')
  if (props.bold === true) text.classList.add('bold')
  append(text, children)
  return text
}

const Raster: Element = props => {
  const columns = props.columns as number
  const rows = props.rows as number
  const canvas = document.createElement('canvas')
  canvas.className = 'cells'
  canvas.width = columns * 2
  canvas.height = rows * 2
  canvas.dataset.columns = String(columns)
  canvas.dataset.rows = String(rows)
  sizeInCells(canvas, columns, rows)
  paint(canvas, props.cells as string, columns, rows)
  return remember(props.key, canvas)
}

const Image_: Element = props => {
  const image = document.createElement('img')
  image.className = 'picture'
  image.alt = typeof props.alt === 'string' ? props.alt : ''
  image.src = pngUrl(props.source)
  sizeInCells(image, props.columns as number, props.rows as number)
  return remember(props.key, image)
}

const ELEMENTS: Readonly<Record<string, Element>> = { Box, Text, Raster, Image: Image_ }

const FRAGMENT = Symbol('Fragment')

/** The JSX factory the mod's layouts are compiled against. */
const h = (type: Element | typeof FRAGMENT, props: Props | null, ...children: Child[]): Node => {
  if (type !== FRAGMENT) return type(props ?? {}, children)
  const fragment = document.createDocumentFragment()
  append(fragment, children)
  return fragment
}

Object.assign(globalThis, { h, Fragment: FRAGMENT })

/** The `$` a layout takes: all it asks of the engine is its elements. */
export const $ = { ui: { resolve: () => ELEMENTS } } as unknown as EngineInterface

/** Replaces what `slot` shows with a layout's tree. */
export const show = (slot: HTMLElement, tree: unknown): void => {
  slot.replaceChildren()
  append(slot, [tree as Child])
}

/** Repaints a drawn Raster or Image, as `$.ui.blit` does; false when nothing has that key. */
export const blit = (key: string, frame: { cells: string } | { source: unknown }): boolean => {
  const element = drawn.get(key)
  if (element === undefined || !element.isConnected) return false

  if ('cells' in frame && element instanceof HTMLCanvasElement) {
    paint(element, frame.cells, Number(element.dataset.columns), Number(element.dataset.rows))
  } else if ('source' in frame && element instanceof HTMLImageElement) {
    element.src = pngUrl(frame.source)
  }

  return true
}
