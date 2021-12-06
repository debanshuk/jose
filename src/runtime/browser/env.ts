export function isCloudflareWorkers() {
  // @ts-expect-error
  return typeof WebSocketPair === 'function'
}
