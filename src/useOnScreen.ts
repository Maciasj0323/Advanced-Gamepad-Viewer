import { useEffect, useState } from 'react'

/** True while at least a fifth of the element is visible in the window. */
export function useOnScreen(el: Element | null): boolean {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.2 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])

  return visible
}