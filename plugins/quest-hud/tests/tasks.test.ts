import { describe, expect, test } from 'claude-code/testing'

import { applyTaskCall, MAX_TASKS, progress } from '../src/tasks'
import type { Task } from '../types'

const created = (id: string, subject: string) => [{ subject, description: '' }, { task: { id, subject } }] as const

const two = (): readonly Task[] => {
  let tasks: readonly Task[] = []
  tasks = applyTaskCall(tasks, 'TaskCreate', ...created('1', 'Read the exporter'))
  tasks = applyTaskCall(tasks, 'TaskCreate', ...created('2', 'Write the tests'))
  return tasks
}

describe('TaskCreate', () => {
  test('appends a pending task with the id the tool answered', () => {
    expect(two()).toEqual([
      { id: '1', subject: 'Read the exporter', status: 'pending' },
      { id: '2', subject: 'Write the tests', status: 'pending' },
    ])
  })

  test('a result with no id is ignored, as later updates could not find it', () => {
    expect(applyTaskCall([], 'TaskCreate', { subject: 'x' }, {})).toEqual([])
    expect(applyTaskCall([], 'TaskCreate', { subject: 'x' }, undefined)).toEqual([])
  })

  test('the same id twice is kept once', () => {
    const tasks = two()
    expect(applyTaskCall(tasks, 'TaskCreate', ...created('1', 'Again'))).toBe(tasks)
  })

  test('stops growing at MAX_TASKS', () => {
    let tasks: readonly Task[] = []
    for (let i = 0; i < MAX_TASKS + 5; i++) tasks = applyTaskCall(tasks, 'TaskCreate', ...created(String(i), `t${i}`))
    expect(tasks).toHaveLength(MAX_TASKS)
  })
})

describe('TaskUpdate', () => {
  test('changes status and subject', () => {
    const tasks = applyTaskCall(two(), 'TaskUpdate', { taskId: '2', status: 'in_progress', subject: 'Write the CSV tests' }, { success: true })
    expect(tasks[1]).toEqual({ id: '2', subject: 'Write the CSV tests', status: 'in_progress' })
    expect(tasks[0]?.status).toBe('pending')
  })

  test('deleted removes the task', () => {
    expect(applyTaskCall(two(), 'TaskUpdate', { taskId: '1', status: 'deleted' }, {}).map(t => t.id)).toEqual(['2'])
  })

  test('an unknown id or a bad status changes nothing', () => {
    const tasks = two()
    expect(applyTaskCall(tasks, 'TaskUpdate', { taskId: '9', status: 'completed' }, {})).toBe(tasks)
    expect(applyTaskCall(tasks, 'TaskUpdate', { taskId: '1', status: 'exploded' }, {})[0]?.status).toBe('pending')
  })
})

describe('TodoWrite', () => {
  test('replaces the whole list', () => {
    const tasks = applyTaskCall(two(), 'TodoWrite', {
      todos: [
        { content: 'Plan', status: 'completed', activeForm: 'Planning' },
        { content: 'Build', status: 'in_progress', activeForm: 'Building' },
        { content: '', status: 'pending', activeForm: '' },
        { content: 'Ship', status: 'weird', activeForm: 'Shipping' },
      ],
    }, {})
    expect(tasks).toEqual([
      { id: 'todo-0', subject: 'Plan', status: 'completed' },
      { id: 'todo-1', subject: 'Build', status: 'in_progress' },
      { id: 'todo-3', subject: 'Ship', status: 'pending' },
    ])
  })

  test('a call without a todos array changes nothing', () => {
    const tasks = two()
    expect(applyTaskCall(tasks, 'TodoWrite', { todos: 'no' }, {})).toBe(tasks)
  })
})

describe('other calls', () => {
  test('any other tool, or an input that is not an object, changes nothing', () => {
    const tasks = two()
    expect(applyTaskCall(tasks, 'Bash', { command: 'ls' }, {})).toBe(tasks)
    expect(applyTaskCall(tasks, 'TaskCreate', null, { task: { id: '5', subject: 'x' } })).toBe(tasks)
  })
})

describe('progress', () => {
  test('counts done and finds the task in progress', () => {
    let tasks = applyTaskCall(two(), 'TaskUpdate', { taskId: '1', status: 'completed' }, {})
    tasks = applyTaskCall(tasks, 'TaskUpdate', { taskId: '2', status: 'in_progress' }, {})
    expect(progress(tasks)).toEqual({ done: 1, total: 2, current: tasks[1] })
  })

  test('an empty list is 0 of 0 with nothing current', () => {
    expect(progress([])).toEqual({ done: 0, total: 0 })
  })
})
