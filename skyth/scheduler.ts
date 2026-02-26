export type ScheduledJob = {
  id: string
  interval: number
  run: () => Promise<void>
  scope: "global" | "session"
}

export const Scheduler = {
  _jobs: new Map<string, ScheduledJob>(),
  register(job: ScheduledJob) {
    this._jobs.set(job.id, job)
  },
  unregister(id: string) {
    this._jobs.delete(id)
  },
  get(id: string) {
    return this._jobs.get(id)
  },
  list() {
    return Array.from(this._jobs.values())
  },
}
