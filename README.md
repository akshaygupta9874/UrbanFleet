<div align="center">

# 🚕 UrbanFleet Platform

### A full-stack, real-time ride-hailing platform — built the way production mobility systems actually work.

*Rider flow • Driver operations • Live dispatch • Secure auth • Payments & ledger accounting — end to end.*

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-010101?style=for-the-badge&logo=websocket&logoColor=white)
![Razorpay](https://img.shields.io/badge/Razorpay-0C2451?style=for-the-badge&logo=razorpay&logoColor=white)

</div>

---

## 📌 Overview

**UrbanFleet Platform** is a full-stack ride-hailing application that mirrors the core experience of modern mobility platforms. It brings together rider flow, driver onboarding, live dispatch, real-time updates, secure session-based authentication, and end-to-end payment settlement in a single, cohesive product.

This isn't a UI mockup — it's a working system with real business logic behind it: ride state machines, driver presence tracking, role-based access, token-rotated auth, CSRF protection, and double-entry ledger accounting for money movement.

> 💡 **TL;DR for recruiters:** This project demonstrates the same architectural patterns used at real ride-hailing and fintech companies — idempotent payments, webhook-driven settlement, Redis-backed real-time state, and a properly layered backend. It's built to be read, not just run.

---

## 📑 Table of Contents

- [✨ Why This Project Stands Out](#-why-this-project-stands-out)
- [🧩 Core Features](#-core-features)
- [🛠️ Tech Stack](#️-tech-stack)
- [🏗️ Architecture](#️-architecture)
- [🔄 Ride Lifecycle](#-ride-lifecycle)
- [🔐 Authentication & Security](#-authentication--security)
- [💳 Payments & Ledger System](#-payments--ledger-system)
- [⚡ Real-Time Socket Architecture](#-real-time-socket-architecture)
- [🗄️ Redis Design](#️-redis-design)
- [⚙️ Backend Services Layer](#️-backend-services-layer)
- [🎨 Frontend Highlights](#-frontend-highlights)
- [📁 Project Structure](#-project-structure)
- [🌱 Environment Variables](#-environment-variables)
- [🚀 Getting Started](#-getting-started)
- [🗺️ Roadmap](#️-roadmap)
- [📊 Current Maturity](#-current-maturity)

---

## ✨ Why This Project Stands Out

| | |
|---|---|
| 🧑‍🤝‍🧑 **Multi-role experience** | Complete, separate flows for riders, drivers, and admins |
| ⚡ **Genuine real-time layer** | Native WebSockets — not polling — for live ride and driver events |
| 🔐 **Production-grade auth** | JWT rotation, Redis-backed sessions, CSRF protection, OTP-gated login |
| 💰 **Real accounting, not a status flag** | Double-entry, append-only ledger with paise-precision money handling |
| 🧠 **Layered backend design** | Clear separation between controllers, services, repositories, and sockets |
| 🖼️ **Cloud media pipeline** | Cloudinary-backed uploads for driver verification documents |
| 🧪 **Idempotency & concurrency safety** | Redis locks and idempotency keys prevent duplicate charges and race conditions |

This project combines several production-like capabilities in one repository, making it a strong foundation for a scalable transportation marketplace or any booking-driven platform.

---

## 🧩 Core Features

### 🧍 Rider Experience
- 📝 User registration and login
- ✉️ Email-based verification flow
- 🚖 Ride booking request creation
- 📍 Live ride status tracking — from search to completion
- 🕓 Ride history viewing
- 💳 Payment-ready ride completion flow

### 🚗 Driver Experience
- 📋 Driver registration and onboarding
- ✅ Driver verification workflow
- 📊 Real-time driver dashboard
- 🟢 Online/offline and available/busy state control
- 🤝 Ride acceptance and full lifecycle handling
- 💵 Earnings, trip, and distance tracking

### 🌐 Platform Capabilities
- 🔌 Real-time ride events via WebSockets
- 📡 Driver availability & presence tracking with Redis
- 🗺️ Geolocation-based driver discovery
- 🔑 JWT auth with refresh-token rotation
- 🛡️ Session and CSRF security middleware
- ☁️ Cloudinary upload integration for documents/images
- 💳 Razorpay payment order creation and verification

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 19 + TypeScript | Core UI framework |
| Vite 8 | Build tooling & dev server |
| React Router | Route-based navigation |
| Axios | Centralized API communication |
| Tailwind CSS | Styling |
| Framer Motion | Animations |
| Leaflet | Map-related UI |
| shadcn-style components | Reusable UI architecture |

### Backend
| Technology | Purpose |
|---|---|
| Node.js + Express + TypeScript | API server |
| MongoDB + Mongoose | Persistent data store |
| Redis | Sessions, presence, geo, security tokens |
| `ws` (WebSockets) | Real-time communication |
| JWT | Authentication |
| Zod | Request validation |
| Multer | File upload handling |
| Cloudinary | Media storage & delivery |
| Razorpay SDK | Payments |
| Nodemailer | Transactional email |

---

## 🏗️ Architecture

The project is a **monorepo** split into a `frontend/` and `backend/`, following a layered architecture that keeps concerns cleanly separated:

- 🎨 **Frontend** — manages UI, routing, auth state, and user interactions
- 🌐 **Backend** — exposes REST APIs for auth, rides, drivers, and payments
- 🔌 **WebSockets** — power real-time ride events and driver updates
- 🗄️ **Redis** — holds short-lived state: sessions, verification tokens, driver presence, geolocation
- 🍃 **MongoDB** — stores persistent records: users, drivers, rides, payments, metadata

### Main Business Flow

1. **🔑 Authentication & Onboarding** — Register, verify email, log in, and access protected areas. JWT access + refresh tokens are backed by Redis for session safety and rotation.
2. **🚖 Ride Creation** — Rider submits pickup, destination, distance, and fare estimate; backend validates and kicks off dispatch.
3. **🎯 Driver Matching & Assignment** — The system routes requests to available nearby drivers and notifies all parties via socket events.
4. **📍 Ride Progress** — The ride moves through a well-defined state machine (see below).
5. **💳 Payment & Settlement** — Once payment-eligible, an order is created and the ride is finalized only after payment is accepted.

---

## 🔄 Ride Lifecycle

The ride system is modeled as an explicit state machine:

```
SEARCHING → DRIVER_ASSIGNED → DRIVER_ARRIVING → STARTED → ARRIVED_AT_DESTINATION → COMPLETED
                                                                                   ↘ CANCELLED
```

This lets the backend coordinate assignment, communication, payment readiness, and completion in a controlled, predictable way.

---

## 🔐 Authentication & Security

Security is one of the strongest parts of this project — implemented as a **multi-step, session-aware system**, not a simple login endpoint.

### 🔁 Auth Flow

1. **Registration** — Zod-validated input, bcrypt password hashing, Redis-stored verification email, IP/email-based rate limiting.
2. **Email Verification** — Short-lived Redis token; resend supported.
3. **Login** — Credential check → one-time OTP emailed as a second verification layer.
4. **Password Reset** — Time-limited Redis token; resets password and invalidates active refresh sessions.
5. **Access & Refresh Tokens** — JWT access + rotating refresh tokens, validated against Redis-backed session data.
6. **Session Management** — Redis-backed sessions with per-session IDs; revocable, regenerable, and destroyed on logout/reset.
7. **Auth Middleware** — Verifies token validity, session existence, and session-user match on every protected route.
8. **CSRF Protection** — Redis-stored CSRF tokens attached via cookie + header, validated on every non-GET request.

### 🛡️ Defense-in-Depth Summary

| Layer | Protection |
|---|---|
| **CSRF** | Per-user token in Redis, verified on all state-changing requests |
| **XSS** | No unsafe DOM injection; controlled rendering + backend validation |
| **Session** | Server-side Redis sessions tied to user identity, revocable on logout |
| **Token Replay** | Refresh-token rotation invalidates stolen/reused tokens over time |
| **Rate Limiting** | Applied to registration, login, password reset, and resend actions |

Together, these controls harden the app against CSRF attacks, session fixation, token replay, and unauthorized state-changing requests — while keeping the integrity of every user action verifiable.

### 🧱 Models & Validation
- **Mongoose models** define schema, relationships, indexes, and rules for users, drivers, rides, payments, and ledger entries.
- **Zod schemas** validate every auth, ride, driver, and payment request before it reaches business logic.
- **Axios interceptor** (frontend) auto-attaches access + CSRF tokens, sends credentials, and silently retries on 401/403 — while avoiding refresh loops on logout/refresh calls themselves.
- **Protected routes** redirect unauthenticated users to login and gate role-restricted screens behind an unauthorized page.

---

## 💳 Payments & Ledger System

The payment subsystem is the most business-critical part of the platform — a dedicated domain module supporting real checkout, gateway verification, webhook processing, refunds, and **ledger-based accounting**.

### 🧭 Payment Lifecycle

1. **Order Creation** — Only triggered once a ride is payment-eligible. Validates ride ownership and fare breakdown, then creates a Razorpay order using an **idempotency key + Redis lock** to prevent duplicate orders on retry.
2. **Checkout Verification** — Client sends order ID, payment ID, and signature; backend verifies via **HMAC-SHA256**.
3. **Webhook-Driven Settlement** — Razorpay webhooks are the *source of truth*. A Redis dedup layer prevents double-processing:
   - `payment.captured` → marks payment captured, posts ledger entries, updates ride status, notifies the driver via socket
   - `payment.failed` → marks failed, increments retry count

### 📒 Ledger Design

Every captured payment posts a **balanced, multi-leg transaction**:

| Party | Entry |
|---|---|
| 🧍 Rider | Debited full fare |
| 🏢 Platform | Credited commission |
| 🚗 Driver | Credited earning |

- 💰 All amounts stored as **integer paise** — no floating-point rounding issues
- 📜 **Append-only** — entries are never edited or deleted; refunds create *reversing* entries for a full audit trail
- ⚖️ Schema-level validation ensures every transaction stays balanced with only positive integer amounts

### ↩️ Refunds
- Protected by a Redis lock to prevent double-refunding
- Supports **partial or full** refunds based on remaining refundable amount
- Reverses the original ledger legs proportionally with mirrored debit/credit entries
- Status transitions: `captured → partially_refunded → refunded`

### Why It's Strong
This isn't a stubbed integration — it includes idempotency protection, webhook deduplication, Redis-based concurrency control, and accounting-correct ledger structure with strong validation around ownership, state, and money. It feels like a real commercial transport product, not a demo.

---

## ⚡ Real-Time Socket Architecture

Instead of relying only on REST, the backend maintains **live WebSocket connections** so ride and driver updates push instantly.

### How a Connection Comes Alive
1. Client connects with an access token in the WebSocket URL query string
2. JWT is verified, user loaded from MongoDB (driver profile resolved if applicable)
3. Socket is enriched with user ID, role, session ID, and driver ID
4. Connection is registered in the **socket registry** and handed off to event handlers

### 📡 Event Contract

| Driver Events | Rider Events | Server Events |
|---|---|---|
| `GO_ONLINE` / `GO_OFFLINE` | `REQUEST_RIDE` | `NEW_RIDE` |
| `UPDATE_LOCATION` | `CANCEL_RIDE` | `RIDE_ACCEPTED` |
| `HEARTBEAT` | `UPDATE_LOCATION` | `DRIVER_LOCATION` |
| `SET_AVAILABLE` / `SET_BUSY` | | `RIDE_STARTED` |
| `ACCEPT_RIDE` | | `RIDE_COMPLETED` |
| `START_RIDE` / `COMPLETE_RIDE` | | `RIDE_CANCELLED` |
| `CANCEL_RIDE_BY_DRIVER` | | `ERROR` |

Explicit event constants keep the communication contract clear and prevent accidental event-name mismatches.

### 🧵 Message Flow

```
Rider creates ride (REST)
        ↓
Ride service starts dispatch
        ↓
Matching service finds eligible nearby drivers
        ↓
Emitter pushes NEW_RIDE to relevant driver sockets
        ↓
Driver responds via ACCEPT_RIDE
        ↓
Driver handler → Ride service updates MongoDB + Redis
        ↓
Emitter pushes RIDE_ACCEPTED / RIDE_STARTED / RIDE_COMPLETED to rider
```

### 🧩 Supporting Components
- **Dispatcher** — parses & validates every incoming message, routes it to the correct rider/driver handler, and returns a structured error for unknown events
- **Socket Registry** — tracks connected sockets by user/role for targeted, direct messaging
- **Emitters** — send targeted JSON payloads to specific riders or drivers (new ride, cancellation, arrival, payment updates, etc.)
- **Validators** — Zod-based validation of raw socket payloads (ride IDs, coordinates, booleans) before they touch business logic
- **Error Utility** — sends structured error events back to the client instead of failing silently

This real-time layer is what makes the platform feel *live and reactive* rather than a static CRUD app.

---

## 🗄️ Redis Design

Redis is a **core part of the app's real-time and security infrastructure** — not just a cache — handling data that's short-lived, frequently updated, and shared across services.

### 🔑 Key Schema

| Key Pattern | Stores |
|---|---|
| `session:{sessionId}` | Session payload (user ID, role, created-at) |
| `user-sessions:{userId}` | Set of all active session IDs for a user |
| `refresh-token:{userId}:{sessionId}` | Current refresh token — powers rotation |
| `csrf:{userId}` | Active CSRF token |
| `user:{userId}` | Cached user profile for fast reads |
| `verify:{token}` | Pending registration payload (short TTL) |
| `verify:email:{email}` | Debounces duplicate verification emails |
| `otp:{email}` | One-time login verification code |
| `reset-password:{token}` | Email tied to an active reset link |
| `driver:presence:{driverId}` | Online/available state + last-seen timestamp |
| `drivers:geo` | Geospatial coordinates for nearest-driver lookup |
| `rider:presence` | Rider-side presence tracking |
| `active:rides` | Shared operational view of active rides |

### Why Redis
These values are short-lived, highly mutable, and time-sensitive — using Redis instead of MongoDB for them means **faster auth checks, faster driver availability updates, automatic token expiry, and reduced database load**, all while powering real-time matching and presence.

---

## ⚙️ Backend Services Layer

The services layer holds the platform's actual business logic — the difference between "a collection of routes" and a real product.

| Service | Responsibility |
|---|---|
| 🧭 **Ride Service** | Central orchestrator — creates, assigns, progresses, cancels, and looks up rides; keeps the state machine consistent and drives socket notifications |
| 📡 **Dispatch Service** | Turns a new ride into an active dispatch process — batches requests to nearby drivers, handles timeout-based retries, stops dispatch on accept/cancel |
| 🎯 **Matching Service** | Bridges geospatial discovery and dispatch — filters nearby drivers down to those actually available and eligible |
| 💰 **Fare Service** | Centralizes pricing — base fare, distance-based cost, vehicle multipliers, commission/earning split, final breakdown |
| ☁️ **Cloudinary Service** | Handles upload, secure URL generation, and deletion for driver documents and images |

Keeping business rules here — rather than scattered across controllers — improves maintainability, testability, and separation of concerns.

---

## 🎨 Frontend Highlights

Built as a modern React + TypeScript experience with a clean split between pages, reusable components, and shared app state.

- 🧭 Smooth multi-step journey: signup → verification → login → ride booking → tracking
- 📊 Dedicated driver dashboard with online/offline and availability state control
- 🔒 Protected, role-aware routing across rider/driver/admin screens
- 🔁 Centralized Axios interceptor for auth, refresh, and CSRF handling
- ⚛️ Interactive, React-driven state updates with route-level navigation

---

## 📁 Project Structure

<details>
<summary><strong>Click to expand full folder structure</strong></summary>

```text
Project/
  backend/
    src/
      config/            # cloudinary, db, razorpay, mail config
      constants/
      controllers/        # auth, driver, ride, user
      middlewares/        # auth, csrf, session, multer, error handling
      models/              # driver, ride, user
      payment/             # controllers, services, repositories, models, validation
      redis/                # client, keys, services (presence, geo)
      routes/
      services/            # ride, dispatch, matching, fare, cloudinary
      sockets/             # event constants, handlers, emitters, registry, validators
      utils/
      zodSchemas/

  frontend/
    src/
      LandingPage.tsx / LandingPage2.tsx / FinalLandingPage.tsx
      Login.tsx / Signup.tsx / VerifyEmail.tsx
      ForgotPassword.tsx / ResetPassword.tsx
      Dashboard.tsx / DriverDashboard.tsx / DriverRegistration.tsx
      RideDetails.tsx / RideHistory.tsx
      ChooseMode.tsx / NavBar.tsx / BottomBanner.tsx
      apiInterceptor.ts
      components/          # DriverCTA, LoadingScreen, MapView, ProtectedRoutes, ui/
      context/               # authContext
      lib/                    # api, driverApi, payment, socket, utils
      services/              # geoapify.service
```

</details>

---

## 🌱 Environment Variables

<details>
<summary><strong>Click to expand required variables</strong></summary>

```env
MONGODB_URI=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
FRONTEND_URL=
```

</details>

---

## 🚀 Getting Started

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### 📜 Available Scripts

| Location | Script | Description |
|---|---|---|
| Backend | `npm run dev` | Start backend in watch mode |
| Backend | `npm run build` | Compile TypeScript |
| Backend | `npm run start` | Run the built backend |
| Frontend | `npm run dev` | Start Vite dev server |
| Frontend | `npm run build` | Build production bundle |
| Frontend | `npm run preview` | Preview production build locally |

---

## 🧪 Quality Gates and CI

The repository has a backend-first automated test foundation. It deliberately
uses the real Express application, native `ws` server, and Redis APIs rather
than replacing them with application-level mocks.

### Local checks

```bash
# Backend
cd backend
npm ci
npm run typecheck
npm test                 # unit, API, and WebSocket smoke tests

# Optional: start isolated Redis and MongoDB for integration work
cd ..
docker compose -f docker-compose.test.yml up -d
cd backend
# PowerShell
$env:RUN_INTEGRATION='1'; $env:REDIS_URL='redis://127.0.0.1:6379/15'; npm run test:integration
# Bash
RUN_INTEGRATION=1 REDIS_URL=redis://127.0.0.1:6379/15 npm run test:integration

npm run build

# Frontend
cd ../frontend
npm ci
npm run lint
npm run build
```

The integration test only runs when `RUN_INTEGRATION=1`; this prevents a local
test command from silently connecting to a developer's configured Redis or
production service. Copy `backend/.env.test.example` to `backend/.env.test`
only for local testing, never use production credentials there.

### GitHub Actions

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`
or `master`, plus manual dispatch. It uses `npm ci`, checks backend types,
runs unit/API/WebSocket tests, runs the Redis presence/GEO integration test
against a GitHub Actions Redis service, builds the backend and frontend, builds
the production backend Docker image, and audits production dependencies.

The workflow has read-only permissions, dependency caching, time limits, and
cancels obsolete runs for the same branch/PR.

### Deployment readiness

The repository now includes a production backend `Dockerfile` and `/healthz`.
It does not deploy automatically because no container registry, deployment
target, or GitHub environment secrets are configured in this repository.
Before enabling CD, configure a registry and deployment environment, then add
required production secrets there rather than committing them. Protect the
default branch and require the `Backend quality and tests` and `Frontend quality
and build` checks before merge.

---

## 🗺️ Roadmap

- [ ] 🧪 Automated testing for auth, ride transitions, and payments
- [ ] 📈 Better logging and monitoring
- [ ] 🏭 Stronger production deployment readiness
- [ ] 🎯 Improved dispatch matching and scaling logic
- [ ] 🛠️ Richer admin tools and analytics
- [ ] 🎨 More polished UI and UX refinements

---

## 📊 Current Maturity

**UrbanFleet Platform** is a strong MVP and engineering prototype with real product logic — already demonstrating the core pieces of a modern ride-sharing platform, backed by a meaningful architecture. It's a solid base for further feature development, scalability upgrades, deployment hardening, and larger team collaboration.

---

<div align="center">

### 🏁 Final Note

A full-stack ride-hailing platform that shows real product thinking, layered engineering, and production-style patterns — built to demonstrate how frontend and backend systems come together to support a real user journey, end to end.

**⭐ If this project interests you, feel free to explore the code or reach out!**

</div>
