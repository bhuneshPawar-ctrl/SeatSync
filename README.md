# 🎟️ SeatSync API - High-Concurrency Ticket Booking Backend

SeatSync is a robust, highly concurrent ticket booking backend designed to handle flash-sale traffic spikes without overselling or data corruption. Built with Node.js, Redis, MongoDB, and BullMQ, this API mathematically prevents race conditions, ensures financial data integrity, and processes distributed async tasks efficiently.

## 🚀 Key Architectural Features

### ⚡ High-Concurrency Inventory (Redis)
- **Atomic Operations:** Uses single-threaded Redis `DECRBY` operations to manage ticket inventory under high concurrency and prevent overselling during concurrent bookings.
- **Compensating Mechanisms:** Tracks successful inventory deductions in an in-memory list and restores the Redis cache when part of a multi-category booking fails, acting as a robust application-level compensation mechanism.

### 🔄 Fault-Tolerant Async Processing (BullMQ)
- **Event-Driven Pipelines:** Built BullMQ background workers to securely expire abandoned carts and restore reserved inventory.
- **Resiliency:** Configured with automatic retries and exponential backoff to handle temporary failures and worker crashes seamlessly.

### 🗄️ Financial Integrity & Analytics (MongoDB)
- **ACID Transactions:** Uses MongoDB multi-document transactions to keep booking, payment, and user data consistent across distributed checkout flows.
- **Advanced Aggregations:** Built complex aggregation pipelines and strategic indexing for real-time booking and revenue analytics.

### 🤖 AI-Powered Executive Summaries (Gemini)
- **Privacy-First LLM Integration:** Uses the Gemini model to generate automated summaries from aggregated booking metrics. Enforces strict Data Minimization by stripping all Personally Identifiable Information (PII) before sending payloads to the external AI.
- **Graceful Degradation:** Caches LLM responses in Redis to reduce latency and serve cached results instantly when Gemini API is unavailable.

## 🛠️ Tech Stack
- **Environment:** Node.js, Express.js
- **Database:** MongoDB, Mongoose
- **Caching & Virtual Locks:** Redis
- **Task Queues:** BullMQ
- **AI Integration:** Google Gemini 3.1-Flash-Lite

## ⚙️ Local Development Setup

### Prerequisites
- Node.js (v18+)
- MongoDB (Local or Atlas cluster)
- Redis Server (Running locally or via Docker)
