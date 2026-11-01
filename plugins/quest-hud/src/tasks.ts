// Claude Code's own task list, rebuilt from the task tools' calls: the
// waypoints of the quest. Any skill, or Claude on its own, may keep one.
import type { Task } from '../types'

/** More than any real list holds: a bound, so a runaway loop cannot grow it. */
export const MAX_TASKS = 200

type Status = Task['status']

const STATUSES: readonly Status[] = ['pending', 'in_progress', 'completed']

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const asStatus = (value: unknown): Status | undefined =>
  typeof value === 'string' && (STATUSES as readonly string[]).includes(value) ? (value as Status) : undefined

const asText = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined)

const create = (tasks: readonly Task[], input: Record<string, unknown>, result: unknown): readonly Task[] => {
  const task = isRecord(result) && isRecord(result.task) ? result.task : undefined
  const id = asText(task?.id)
  const subject = asText(input.subject) ?? asText(task?.subject)

  if (id === undefined || subject === undefined || tasks.length >= MAX_TASKS || tasks.some(t => t.id === id)) {
    return tasks
  }

  return [...tasks, { id, subject, status: 'pending' }]
}

const updateOne = (tasks: readonly Task[], input: Record<string, unknown>): readonly Task[] => {
  const id = asText(input.taskId)
  const index = tasks.findIndex(task => task.id === id)
  const found = tasks[index]

  if (found === undefined) {
    return tasks
  }

  if (input.status === 'deleted') {
    return tasks.filter(task => task.id !== id)
  }

  const next: Task = {
    ...found,
    subject: asText(input.subject) ?? found.subject,
    status: asStatus(input.status) ?? found.status,
  }

  return tasks.map((task, i) => (i === index ? next : task))
}

const replaceAll = (tasks: readonly Task[], input: Record<string, unknown>): readonly Task[] => {
  if (!Array.isArray(input.todos)) {
    return tasks
  }

  const list: Task[] = []

  input.todos.slice(0, MAX_TASKS).forEach((todo: unknown, index) => {
    const subject = isRecord(todo) ? asText(todo.content) : undefined

    if (isRecord(todo) && subject !== undefined) {
      list.push({ id: `todo-${index}`, subject, status: asStatus(todo.status) ?? 'pending' })
    }
  })

  return list
}

/**
 * The list after one task tool's call: `input` is the call's arguments and
 * `result` what the tool answered. A call this cannot read leaves the list as
 * it was, and so does any other tool; an unchanged list is the same array.
 */
export const applyTaskCall = (tasks: readonly Task[], tool: string, input: unknown, result: unknown): readonly Task[] => {
  if (!isRecord(input)) {
    return tasks
  }

  switch (tool) {
    case 'TaskCreate':
      return create(tasks, input, result)
    case 'TaskUpdate':
      return updateOne(tasks, input)
    case 'TodoWrite':
      return replaceAll(tasks, input)
    default:
      return tasks
  }
}

export type Progress = { done: number; total: number; current?: Task }

/** How far along the list is, and the task in progress, if any. */
export const progress = (tasks: readonly Task[]): Progress => {
  const current = tasks.find(task => task.status === 'in_progress')
  const done = tasks.filter(task => task.status === 'completed').length

  return current ? { done, total: tasks.length, current } : { done, total: tasks.length }
}
