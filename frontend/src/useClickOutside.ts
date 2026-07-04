import { useEffect, useRef, type RefObject } from 'react'

export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean,
) {
  const callbackRef = useRef(onOutside)
  callbackRef.current = onOutside

  useEffect(() => {
    if (!enabled) return

    function handlePointerDown(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        ref.current?.contains(event.target)
      ) {
        return
      }
      callbackRef.current()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [ref, enabled])
}
