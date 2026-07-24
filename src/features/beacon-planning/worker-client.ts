/* Worker 클라이언트 — 요청/진행률/취소 관리 (docs/beacon_planning.md §8).
 * 요청 단위 Promise를 제공하고, requestId 불일치(stale) 응답은 무시한다. */

import type { BeaconPlanRequest, BeaconPlanResult, WorkerRequest, WorkerResponse } from './types'

interface Pending {
  resolve: (r: BeaconPlanResult) => void
  reject: (e: Error) => void
  onProgress?: (phase: string, ratio: number) => void
}

export class PlanningClient {
  private worker: Worker
  private pending = new Map<string, Pending>()

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      const p = this.pending.get(msg.requestId)
      if (!p) return // stale — 화면에 적용하지 않음
      if (msg.type === 'PROGRESS') p.onProgress?.(msg.phase, msg.ratio)
      else if (msg.type === 'RESULT') {
        this.pending.delete(msg.requestId)
        p.resolve(msg.result)
      } else if (msg.type === 'CANCELLED') {
        this.pending.delete(msg.requestId)
        p.reject(new Error('cancelled'))
      } else {
        this.pending.delete(msg.requestId)
        p.reject(new Error(msg.message))
      }
    }
  }

  plan(
    request: BeaconPlanRequest,
    onProgress?: (phase: string, ratio: number) => void,
  ): Promise<BeaconPlanResult> {
    return new Promise((resolve, reject) => {
      this.pending.set(request.requestId, { resolve, reject, onProgress })
      this.worker.postMessage({ type: 'PLAN', request } satisfies WorkerRequest)
    })
  }

  cancel(requestId: string) {
    this.worker.postMessage({ type: 'CANCEL', requestId } satisfies WorkerRequest)
  }

  cancelAll() {
    for (const id of this.pending.keys()) this.cancel(id)
  }

  dispose() {
    this.worker.terminate()
    /* 종료된 워커는 응답하지 않으므로 대기 중 요청을 직접 취소 처리 */
    for (const p of this.pending.values()) p.reject(new Error('cancelled'))
    this.pending.clear()
  }
}
