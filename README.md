# Robot State and Command Visibility

A minimal React and FastAPI experiment for robot command, telemetry, and failure visibility.

## Why

To separate operator intent, command status, observed state, and stale data.

## How 

```mermaid 
flowchart TD
    A[Operator] -->|Interacts with| B[React UI]
    
    N["Not architectural recommendations; only for demonstration compactness"]

    N -.-> C

    classDef note fill:#fffbe6,stroke:#d6b656,color:#333,stroke-dasharray: 5 5;
    class N note;

    B -->|Sends commands| C[FastAPI + WebSocket]
    C -->|Controls| D[Robot]
    D -->|Emits telemetry + events| E[React Visualization]
    E -->|Updates| B

```

Built as a small monorepo with tests prepared on both sides.
