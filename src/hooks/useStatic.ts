import { useRef } from 'react'
const refKey = 'current'
/**
 * @internal
 */
export const useStatic = <T>(init: () => T): T => {
  const ref = useRef<T>(null)
  return ref[refKey] || (ref[refKey] = init())
}
