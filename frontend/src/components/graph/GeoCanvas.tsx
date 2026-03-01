import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer, ArcLayer } from '@deck.gl/layers'
import type { MapboxOverlayProps } from '@deck.gl/mapbox'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { GraphData, GraphNode } from '@/types/graph'
import { useGraphStore } from '@/stores/graph'

const DARK_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

interface AirportPoint {
  id: string | number
  position: [number, number]
  code: string
  city: string
  name: string
  connections: number
}

interface RouteArc {
  sourcePosition: [number, number]
  targetPosition: [number, number]
}

interface TooltipInfo {
  x: number
  y: number
  code: string
  city: string
  name: string
  connections: number
}

interface GeoCanvasProps {
  graphData: GraphData
}

function getNodeId(node: GraphNode['id']): string | number {
  return node
}

export function GeoCanvas({ graphData }: GeoCanvasProps) {
  const selectNode = useGraphStore((s) => s.selectNode)
  const [pulsePhase, setPulsePhase] = useState(0)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const animFrameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const animate = () => {
      setPulsePhase((prev) => (prev + 0.003) % 1)
      animFrameRef.current = requestAnimationFrame(animate)
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animFrameRef.current !== undefined) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [])

  const airports = useMemo<AirportPoint[]>(() => {
    const connectionCounts = new Map<string | number, number>()
    for (const link of graphData.links) {
      const src = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source
      const tgt = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target
      connectionCounts.set(src, (connectionCounts.get(src) ?? 0) + 1)
      connectionCounts.set(tgt, (connectionCounts.get(tgt) ?? 0) + 1)
    }

    return graphData.nodes
      .filter((node) => node.labels.includes('Airport'))
      .filter((node) => typeof node.properties.lat === 'number' && typeof node.properties.lon === 'number')
      .map((node) => ({
        id: getNodeId(node.id),
        position: [node.properties.lon as number, node.properties.lat as number] as [number, number],
        code: String(node.properties.code ?? ''),
        city: String(node.properties.city ?? ''),
        name: String(node.properties.name ?? ''),
        connections: connectionCounts.get(node.id) ?? 0,
      }))
  }, [graphData])

  const airportPositionMap = useMemo<Map<string | number, [number, number]>>(() => {
    const map = new Map<string | number, [number, number]>()
    for (const airport of airports) {
      map.set(airport.id, airport.position)
    }
    return map
  }, [airports])

  const routes = useMemo<RouteArc[]>(() => {
    return graphData.links
      .filter((link) => link.type === 'ROUTE' || link.type === 'route')
      .map((link) => {
        const srcId = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source
        const tgtId = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target
        const srcPos = airportPositionMap.get(srcId)
        const tgtPos = airportPositionMap.get(tgtId)
        if (!srcPos || !tgtPos) return null
        return { sourcePosition: srcPos, targetPosition: tgtPos }
      })
      .filter((arc): arc is RouteArc => arc !== null)
  }, [graphData.links, airportPositionMap])

  const handleAirportClick = useCallback(
    (info: { object?: AirportPoint }) => {
      if (info.object) {
        selectNode(info.object.id)
      }
    },
    [selectNode]
  )

  const handleAirportHover = useCallback((info: { object?: AirportPoint; x: number; y: number }) => {
    if (info.object) {
      setTooltip({
        x: info.x,
        y: info.y,
        code: info.object.code,
        city: info.object.city,
        name: info.object.name,
        connections: info.object.connections,
      })
    } else {
      setTooltip(null)
    }
  }, [])

  const sourceAlpha = Math.floor(40 + 40 * Math.sin(pulsePhase * Math.PI * 2))
  const targetAlpha = Math.floor(60 + 40 * Math.sin(pulsePhase * Math.PI * 2))

  const layers = useMemo(
    () => [
      new ArcLayer<RouteArc>({
        id: 'routes',
        data: routes,
        getSourcePosition: (d) => d.sourcePosition,
        getTargetPosition: (d) => d.targetPosition,
        getSourceColor: [0, 128, 255, sourceAlpha],
        getTargetColor: [0, 200, 255, targetAlpha],
        getWidth: 1,
        getHeight: 0.5,
        greatCircle: true,
        updateTriggers: {
          getSourceColor: pulsePhase,
          getTargetColor: pulsePhase,
        },
      }),
      new ScatterplotLayer<AirportPoint>({
        id: 'airports',
        data: airports,
        getPosition: (d) => d.position,
        getRadius: (d) => 5000 + d.connections * 2000,
        getFillColor: [0, 200, 255, 220],
        radiusMinPixels: 3,
        radiusMaxPixels: 18,
        pickable: true,
        onClick: handleAirportClick,
        onHover: handleAirportHover,
      }),
    ],
    [routes, airports, pulsePhase, sourceAlpha, targetAlpha, handleAirportClick, handleAirportHover]
  )

  return (
    <div className="relative h-full w-full">
      <MapLibreMap
        initialViewState={{ longitude: 0, latitude: 30, zoom: 1.5, pitch: 0 }}
        mapStyle={DARK_MAP_STYLE}
        style={{ width: '100%', height: '100%' }}
      >
        <DeckGLOverlay layers={layers} />
      </MapLibreMap>
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-10 rounded border border-slate-600/60 bg-slate-900/90 px-2 py-1.5 text-xs text-slate-100 shadow-lg backdrop-blur-sm"
          style={{ left: tooltip.x + 12, top: tooltip.y - 40 }}
        >
          <p className="font-bold">{tooltip.code}</p>
          <p className="text-slate-300">{tooltip.city}</p>
          <p className="text-slate-400">{tooltip.connections} routes</p>
        </div>
      ) : null}
    </div>
  )
}
