// A steady timer for a tab in the background. Browsers hold a hidden tab's timers back (once a
// second, then once a minute after a few minutes), which would stall an online table this tab hosts
// and make the others think it left. A worker's timer is not held back that way, so it drives these
// ticks when the page may start one; a plain interval stands in where it may not (CSP, old browsers).

/** Calls `fn` every `ms` until the returned stop() is called. */
export function every(ms, fn) {
  let timer = 0, worker = null, url = null
  const plain = () => { if (!timer) timer = setInterval(fn, ms) }
  try {
    url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms | 0})`], { type: 'text/javascript' }))
    worker = new Worker(url)
    worker.onmessage = () => fn()
    worker.onerror = () => { worker?.terminate(); worker = null; plain() }
  } catch { worker = null; plain() }
  return () => {
    clearInterval(timer); timer = 0
    worker?.terminate(); worker = null
    if (url) URL.revokeObjectURL(url)
  }
}
