/* Beacon Planning Web Worker — docs/beacon_planning.md §7.4·§8.
 * 계산 중 메인 스레드(UI)를 막지 않는다. 진행률·취소를 지원한다. */

import { PlanCancelled, runPlan } from './engine'
import type { WorkerRequest, WorkerResponse } from './types'

const cancelled = new Set<string>()
const post = (msg: WorkerResponse) => postMessage(msg)

onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'CANCEL') {
    cancelled.add(msg.requestId)
    return
  }
  const { request } = msg
  try {
    const result = runPlan(request, {
      onProgress: (phase, ratio) =>
        post({ type: 'PROGRESS', requestId: request.requestId, phase, ratio }),
      shouldCancel: () => cancelled.has(request.requestId),
    })
    if (cancelled.has(request.requestId)) {
      cancelled.delete(request.requestId)
      post({ type: 'CANCELLED', requestId: request.requestId })
      return
    }
    post({ type: 'RESULT', requestId: request.requestId, result })
  } catch (err) {
    if (err instanceof PlanCancelled) {
      cancelled.delete(request.requestId)
      post({ type: 'CANCELLED', requestId: request.requestId })
      return
    }
    post({
      type: 'ERROR',
      requestId: request.requestId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
