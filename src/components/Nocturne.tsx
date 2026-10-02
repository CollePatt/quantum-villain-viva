export type NocturneMood = 'idle' | 'speaking' | 'thinking' | 'smug' | 'defeated'

type NocturneProps = {
  mood?: NocturneMood
  size?: number
}

const ORBIT = 'M 8 100 A 92 32 0 1 1 192 100 A 92 32 0 1 1 8 100 Z'

export function Nocturne({ mood = 'idle', size = 160 }: NocturneProps) {
  return (
    <div className={`nocturne mood-${mood}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <defs>
          <radialGradient id="noc-head" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="#5b3fd6" />
            <stop offset="55%" stopColor="#24124f" />
            <stop offset="100%" stopColor="#0d0820" />
          </radialGradient>
          <linearGradient id="noc-orbit" x1="0" x2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.1" />
          </linearGradient>
          <filter id="noc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="noc-orbits">
          {[-28, 28].map((angle, index) => (
            <g key={angle} transform={`rotate(${angle} 100 100)`}>
              <path d={ORBIT} fill="none" stroke="url(#noc-orbit)" strokeWidth="2" />
              <circle r="5" fill="#bef264" filter="url(#noc-glow)">
                <animateMotion
                  dur={index === 0 ? '3.2s' : '4.1s'}
                  repeatCount="indefinite"
                  path={ORBIT}
                  begin={index === 0 ? '0s' : '-1.6s'}
                />
              </circle>
            </g>
          ))}
        </g>

        <g className="noc-head">
          <circle cx="100" cy="100" r="58" fill="url(#noc-head)" />
          <circle cx="100" cy="100" r="58" fill="none" stroke="#a78bfa" strokeOpacity="0.45" strokeWidth="2" />

          <g className="noc-brows" stroke="#f4f2ff" strokeWidth="5" strokeLinecap="round">
            <line x1="66" y1="78" x2="90" y2="88" />
            <line x1="134" y1="78" x2="110" y2="88" />
          </g>

          <g className="noc-eyes" fill="#22d3ee" filter="url(#noc-glow)">
            <ellipse cx="80" cy="98" rx="9" ry="5" />
            <ellipse cx="120" cy="98" rx="9" ry="5" />
          </g>

          <g className="noc-mouth">
            <path className="noc-smirk" d="M 82 124 Q 104 134 120 120" fill="none" stroke="#f4f2ff" strokeWidth="4" strokeLinecap="round" />
            <path className="noc-frown" d="M 84 130 Q 100 118 116 130" fill="none" stroke="#f4f2ff" strokeWidth="4" strokeLinecap="round" />
            <g className="noc-bars" fill="#bef264">
              {[0, 1, 2, 3, 4].map((bar) => (
                <rect key={bar} x={83 + bar * 7.5} y="116" width="4.5" height="14" rx="2.25" />
              ))}
            </g>
          </g>
        </g>
      </svg>
    </div>
  )
}
