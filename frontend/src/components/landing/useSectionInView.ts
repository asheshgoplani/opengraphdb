import { useEffect, useRef, useState } from 'react'

interface UseSectionInViewOptions {
  threshold?: number
  rootMargin?: string
  once?: boolean
}

export function useSectionInView<T extends HTMLElement>({
  threshold = 0.15,
  rootMargin = '0px 0px -10% 0px',
  once = true,
}: UseSectionInViewOptions = {}) {
  const ref = useRef<T | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      const fallback = window.setTimeout(() => setIsInView(true), 0)
      return () => window.clearTimeout(fallback)
    }

    let hasIntersected = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return

        hasIntersected = true
        setIsInView(true)

        if (once) {
          observer.disconnect()
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(element)

    return () => {
      if (!once || !hasIntersected) {
        observer.disconnect()
      }
    }
  }, [once, rootMargin, threshold])

  return { ref, isInView }
}
