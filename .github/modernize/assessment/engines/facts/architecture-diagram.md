# Architecture Diagram

SISCO is implemented as a Next.js full-stack web application. The repository evidence shows a React presentation layer, Next.js server endpoints and tRPC business procedures, and PostgreSQL accessed through Drizzle ORM; it does not show Express or Sequelize as the active application stack.

## Application Architecture

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
~~~mermaid
flowchart TD
    subgraph Client["Client layer"]
        Browser["Web browser"]
        ReactUI["React 19 interface"]
    end
    subgraph Presentation["Presentation layer"]
        NextApp["Next.js App Router"]
        Tailwind["Tailwind CSS"]
    end
    subgraph Business["Business layer"]
        TRPC["tRPC routers"]
        RouteHandlers["Next.js Route Handlers"]
        AuthRBAC["Better Auth and RBAC"]
        Domain["Application and domain services"]
        Upload["Authenticated upload route"]
    end
    subgraph Persistence["Persistence layer"]
        Drizzle["Drizzle ORM"]
        PostgreSQL[("PostgreSQL on Neon")]
        Redis[("Upstash Redis")]
        Blob[("Private Vercel Blob")]
    end
    subgraph Providers["External providers"]
        MercadoPago["Mercado Pago"]
        Sentry["Sentry"]
    end

    Browser -->|"renders"| ReactUI
    ReactUI -->|"pages and layouts"| NextApp
    Tailwind -.->|"styles"| ReactUI
    NextApp -->|"typed requests"| TRPC
    NextApp -->|"HTTP endpoints"| RouteHandlers
    TRPC -->|"session and authorization"| AuthRBAC
    TRPC -->|"use cases"| Domain
    RouteHandlers -->|"session checks"| AuthRBAC
    RouteHandlers -->|"uploads and callbacks"| Upload
    Domain -->|"queries and mutations"| Drizzle
    TRPC -->|"queries and mutations"| Drizzle
    Drizzle -->|"SQL"| PostgreSQL
    AuthRBAC -->|"session data"| PostgreSQL
    RouteHandlers -->|"rate limits"| Redis
    Upload -->|"private objects"| Blob
    TRPC -->|"checkout and payment status"| MercadoPago
    RouteHandlers -->|"webhooks"| MercadoPago
    Domain -.->|"error reporting"| Sentry
~~~

### Technology Stack Summary

| Layer | Technology | Version in manifest | Purpose |
|---|---|---:|---|
| Presentation | React | 19.2.4 | Client interface and reusable components |
| Presentation / application shell | Next.js | ^16.3.6 | App Router, server rendering and HTTP Route Handlers |
| Presentation | Tailwind CSS | ^4 | Utility-based styling |
| Business API | tRPC | ^11.17.0 | Typed procedures and request validation |
| Business / identity | Better Auth | ^1.6.26 | Sessions and account authentication |
| Persistence access | Drizzle ORM | ^0.45.2 | PostgreSQL schema, queries and migrations |
| Database | PostgreSQL / Neon Serverless | ^1.1.0 client dependency | Relational persistence |
| Rate limiting | Upstash Redis | ^1.38.0 | Distributed request limits |
| File storage | Vercel Blob | ^2.4.1 | Private evidence and receipt objects |
| Runtime | Node.js | Not pinned in the inspected manifest | Server-side execution environment |
| Error monitoring | Sentry Next.js | ^10.61.0 | Error capture and observability |

### Data Storage & External Services

PostgreSQL is the system of record and is accessed through Drizzle; the configured serverless driver is Neon. Upstash Redis provides rate limiting. Vercel Blob is used for private file storage where configured, with the upload route retaining a development/local fallback. Mercado Pago is the online payment provider, and Sentry is the error-monitoring integration. No separate Express service or active Sequelize persistence layer was identified.

### Key Architectural Decisions

- The application is a Next.js full-stack deployment: tRPC routers and Next.js Route Handlers are the documented server boundaries.
- Tenant and role authorization are applied in tRPC procedures, with PostgreSQL queries filtered by the current fraccionamiento.
- Object uploads use private storage and authenticated retrieval; persisted references are distinct from short-lived signed URLs.

## Component Relationships

<!-- mermaid-checked: no \n, no em-dash/en-dash, no {} in labels, subgraphs are id["label"], arrows are -->|"label"|, all subgraphs closed by end, ids unique -->
~~~mermaid
flowchart LR
    subgraph cPresentation["Presentation"]
        cPages["App Router pages"]
        cComponents["React components"]
        cHooks["Client hooks"]
        cTRPCClient["tRPC React client"]
    end
    subgraph cBusiness["Business logic"]
        cTRPCRouter["tRPC routers"]
        cProcedures["Auth and role procedures"]
        cHandlers["Route Handlers"]
        cUseCases["Application use cases"]
        cDomain["Domain services"]
    end
    subgraph cData["Data access"]
        cRepositories["Repository adapters"]
        cDrizzle["Drizzle schema and queries"]
        cPostgres[("PostgreSQL")]
    end
    subgraph cInfrastructure["Infrastructure"]
        cBetterAuth["Better Auth"]
        cUpload["Upload and private file access"]
        cRedis[("Upstash Redis")]
        cBlob[("Vercel Blob")]
        cMP["Mercado Pago integration"]
        cSentry["Sentry instrumentation"]
    end

    cPages -->|"composes"| cComponents
    cComponents -->|"reads data"| cHooks
    cHooks -->|"typed calls"| cTRPCClient
    cTRPCClient -->|"HTTP batch"| cTRPCRouter
    cTRPCRouter -->|"guards access"| cProcedures
    cProcedures -->|"checks session"| cBetterAuth
    cTRPCRouter -->|"dispatches"| cUseCases
    cUseCases -->|"applies rules"| cDomain
    cUseCases -->|"loads and saves"| cRepositories
    cRepositories -->|"queries"| cDrizzle
    cDrizzle -->|"SQL"| cPostgres
    cHandlers -->|"uses session"| cBetterAuth
    cHandlers -->|"stores and serves files"| cUpload
    cUpload -->|"private objects"| cBlob
    cHandlers -->|"limits traffic"| cRedis
    cTRPCRouter -->|"payment operations"| cMP
    cHandlers -.->|"webhook errors"| cSentry
~~~

### Component Inventory

| Component | Layer | Type | Responsibility |
|---|---|---|---|
| App Router pages | Presentation | Next.js pages/layouts | Route-specific UI and server-rendered composition |
| React components | Presentation | UI components | Resident, treasury, operator and shared views |
| Client hooks | Presentation | React hooks | Client-side data and interaction state |
| tRPC React client | Presentation | API client | Typed communication with server procedures |
| tRPC routers | Business logic | API routers | Domain-facing query and mutation entry points |
| Auth and role procedures | Business logic | Middleware / guards | Session, role, tenant and subscription checks |
| Route Handlers | Business logic | HTTP handlers | Uploads, webhooks, reports and other HTTP endpoints |
| Application use cases | Business logic | Application services | Orchestrate business workflows |
| Domain services | Business logic | Domain layer | Business rules and state transitions |
| Repository adapters | Data access | Infrastructure adapters | Implement data access ports |
| Drizzle schema and queries | Data access | ORM | Map PostgreSQL tables and execute queries |
| PostgreSQL | Data access | Relational database | Persistent user, tenant, charge and payment data |
| Better Auth | Infrastructure | Identity integration | Authentication and session resolution |
| Upload and private file access | Infrastructure | File API | Validate, store and serve authenticated files |
| Upstash Redis | Infrastructure | Distributed rate-limit store | Request limiting state |
| Vercel Blob | Infrastructure | Object storage | Private object storage for uploaded files |
| Mercado Pago integration | Infrastructure | Payment provider | Checkout and payment-status integration |
| Sentry instrumentation | Infrastructure | Observability | Error and runtime reporting |
