# OpenGraphDB Frontend Specification

## Vision

A web-based frontend for OpenGraphDB that combines graph exploration, database administration, and a showcase experience into a single application. Think Neo4j Browser meets Grafana meets a product landing page.

## Target Users

1. **Developers** using OpenGraphDB who want to visually explore and query their graph data
2. **Operators** monitoring database health, schema, and performance
3. **Evaluators** trying out OpenGraphDB for the first time via an interactive demo

## Core Features

### 1. Graph Explorer (Primary)

Interactive visual graph exploration and Cypher query interface.

- **Query Editor**: Cypher query input with syntax highlighting, autocomplete, history
- **Graph Visualization**: Force-directed graph rendering of query results
  - Nodes rendered as labeled circles (colored by label)
  - Edges rendered as directional lines (labeled by type)
  - Click a node to expand its relationships
  - Double-click to collapse
  - Drag to reposition, scroll to zoom
  - Selection: click to inspect properties in a side panel
- **Results Table**: Tabular view of query results (toggle between graph and table view)
- **Query History**: Recent queries with re-run capability
- **Saved Queries**: Bookmark frequently used queries
- **Export**: Download results as JSON, CSV

### 2. Admin Dashboard

Database health and management interface.

- **Health Status**: Connection status, uptime, database size
- **Metrics Panel**: Query count, average latency, active connections (from GET /metrics)
- **Schema Browser**: Visual display of node labels, relationship types, property keys (from GET /schema)
- **Import/Export**: Upload CSV/JSON files for import, trigger exports
- **Index Management**: View and create indexes

### 3. Demo/Showcase

Landing page experience for new users.

- **Hero Section**: What OpenGraphDB is, key differentiators (embeddable, Cypher, AI-native)
- **Interactive Playground**: Pre-loaded sample graph with guided queries
  - "Try it now" with example Cypher queries
  - Click-to-run sample queries that show graph visualization
- **Feature Highlights**: Performance benchmarks, protocol support, language bindings
- **Getting Started**: Quick start guide, installation commands

## Technical Requirements

### Backend Connection
- Connect to OpenGraphDB HTTP REST API (default: localhost:8080)
- Endpoints used: POST /query, GET /health, GET /metrics, GET /schema, POST /import, POST /export
- Configurable server URL

### Tech Stack
- React + TypeScript
- Tailwind CSS + Shadcn/ui for UI components
- Graph visualization library (e.g., react-force-graph, cytoscape.js, or d3-force)
- Monaco Editor or CodeMirror for Cypher editor
- Vite for build tooling

### Non-Functional
- Responsive (works on desktop and tablet)
- Dark mode support
- Fast initial load (code-split by route)
- Works as a standalone SPA served by any static file server
- Can also be served directly by OpenGraphDB's HTTP server (future)

## Pages/Routes

1. `/` - Landing/Demo page
2. `/explore` - Graph Explorer (query + visualization)
3. `/dashboard` - Admin Dashboard
4. `/playground` - Interactive playground (subset of explorer with guided experience)

## Out of Scope (for now)

- User authentication/authorization
- Multi-database support
- Real-time streaming/subscriptions
- Mobile-optimized layout
- Bolt protocol from browser (would need WebSocket bridge)
