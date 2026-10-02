import { useEffect, useRef, useState } from 'react'

export type ObserverMood =
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'impressed'
  | 'smug'
  | 'angry'
  | 'defeated'

type ObserverProps = {
  mood?: ObserverMood
  width?: number
  followPointer?: boolean
}

type Gaze = { x: number; y: number }

// How far the upper and lower lids close (0 = wide open, 60 = shut), pupil size,
// and where the eye looks when the mood fixes its gaze.
const MOOD_SHAPE: Record<ObserverMood, { upper: number; lower: number; pupil: number; gaze?: Gaze }> = {
  idle: { upper: 4, lower: 0, pupil: 1 },
  listening: { upper: 8, lower: 2, pupil: 1.25, gaze: { x: 0, y: 10 } },
  speaking: { upper: 10, lower: 4, pupil: 1, gaze: { x: 0, y: 4 } },
  thinking: { upper: 16, lower: 8, pupil: 0.85 },
  impressed: { upper: -2, lower: -2, pupil: 0.5, gaze: { x: 0, y: -4 } },
  smug: { upper: 40, lower: 26, pupil: 0.85, gaze: { x: 22, y: 4 } },
  angry: { upper: 46, lower: 32, pupil: 0.6, gaze: { x: 0, y: 4 } },
  defeated: { upper: 40, lower: 4, pupil: 1.1, gaze: { x: -26, y: 14 } },
}

const WANDERING: ObserverMood[] = ['idle', 'thinking']
const MAX_X = 40
const MAX_Y = 16

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function Observer({ mood = 'idle', width = 220, followPointer = false }: ObserverProps) {
  const shape = MOOD_SHAPE[mood]
  const [wanderGaze, setWanderGaze] = useState<Gaze>({ x: 0, y: 0 })
  const [pointerGaze, setPointerGaze] = useState<Gaze | null>(null)
  const [isBlinking, setIsBlinking] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const pointerAtRef = useRef(0)

  // Glance around when nothing holds the eye's attention.
  useEffect(() => {
    if (!WANDERING.includes(mood) || prefersReducedMotion()) {
      return
    }
    let timer = 0
    const look = () => {
      setWanderGaze({
        x: Math.round((Math.random() * 2 - 1) * MAX_X),
        y: Math.round((Math.random() * 2 - 1) * MAX_Y),
      })
      const pause = mood === 'thinking' ? 280 + Math.random() * 260 : 900 + Math.random() * 1600
      timer = window.setTimeout(look, pause)
    }
    timer = window.setTimeout(look, 400)
    return () => window.clearTimeout(timer)
  }, [mood])

  // Blink every few seconds.
  useEffect(() => {
    if (prefersReducedMotion()) {
      return
    }
    let timer = 0
    const schedule = () => {
      timer = window.setTimeout(() => {
        setIsBlinking(true)
        timer = window.setTimeout(() => {
          setIsBlinking(false)
          schedule()
        }, 140)
      }, 2400 + Math.random() * 3200)
    }
    schedule()
    return () => window.clearTimeout(timer)
  }, [])

  // On the home screen the eye tracks the player's finger or cursor.
  useEffect(() => {
    if (!followPointer || prefersReducedMotion()) {
      return
    }
    const onMove = (event: PointerEvent) => {
      const box = svgRef.current?.getBoundingClientRect()
      if (!box) {
        return
      }
      const dx = event.clientX - (box.left + box.width / 2)
      const dy = event.clientY - (box.top + box.height / 2)
      const distance = Math.max(1, Math.hypot(dx, dy))
      const reach = Math.min(1, distance / 260)
      pointerAtRef.current = Date.now()
      setPointerGaze({
        x: Math.round((dx / distance) * MAX_X * reach),
        y: Math.round((dy / distance) * MAX_Y * 1.6 * reach),
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onMove)
    const release = window.setInterval(() => {
      if (Date.now() - pointerAtRef.current > 2500) {
        setPointerGaze(null)
      }
    }, 500)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onMove)
      window.clearInterval(release)
    }
  }, [followPointer])

  const gaze = shape.gaze ?? pointerGaze ?? wanderGaze
  const gx = Math.max(-MAX_X, Math.min(MAX_X, gaze.x))
  const gy = Math.max(-MAX_Y, Math.min(MAX_Y, gaze.y))
  const upper = isBlinking ? 62 : shape.upper
  const lower = isBlinking ? 58 : shape.lower

  return (
    <div className={`observer mood-${mood}`} style={{ width }} aria-hidden="true">
      <svg ref={svgRef} viewBox="-10 -40 260 220" width={width} height={(width * 220) / 260}>
        <defs>
          <clipPath id="observer-almond">
            <path d="M10 80 Q120 -6 230 80 Q120 166 10 80 Z" />
          </clipPath>
        </defs>

        <g className="obs-brow obs-brow-left">
          <line x1="22" y1="16" x2="92" y2="34" />
        </g>
        <g className="obs-brow obs-brow-right">
          <line x1="218" y1="16" x2="148" y2="34" />
        </g>

        <path className="obs-white" d="M10 80 Q120 -6 230 80 Q120 166 10 80 Z" />

        <g clipPath="url(#observer-almond)">
          <g className="obs-iris" style={{ transform: `translate(${gx}px, ${gy}px)` }}>
            <circle className="obs-orbit" cx="120" cy="80" r="46" />
            <circle className="obs-ring" cx="120" cy="80" r="35" />
            <g className="obs-spin">
              <circle className="obs-dash" cx="120" cy="80" r="23" />
            </g>
            <circle
              className="obs-pupil"
              cx="120"
              cy="80"
              r="13"
              style={{ transform: `scale(${shape.pupil})` }}
            />
            <circle className="obs-glint" cx="127" cy="72" r="4" />
          </g>
          <g className="obs-lid-upper" style={{ transform: `translateY(${upper}px)` }}>
            <path className="obs-lid" d="M-10 -170 H250 V0 Q120 44 -10 0 Z" />
            <path className="obs-lid-edge" d="M-10 0 Q120 44 250 0" />
          </g>
          <g className="obs-lid-lower" style={{ transform: `translateY(${-lower}px)` }}>
            <path className="obs-lid" d="M-10 330 H250 V160 Q120 118 -10 160 Z" />
            <path className="obs-lid-edge" d="M-10 160 Q120 118 250 160" />
          </g>
        </g>

        <path className="obs-outline" d="M10 80 Q120 -6 230 80 Q120 166 10 80 Z" />
      </svg>
    </div>
  )
}
