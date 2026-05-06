# 🛒 Digital-E — Full-stack E-commerce Platform

> A practical full-stack e-commerce monorepo with a React frontend, Express backend, and Vercel-ready API configuration. Includes authentication, product browsing, cart/wishlist management, orders, and reviews.

![Tech Stack](https://img.shields.io/badge/Stack-Full--stack-blueviolet)
![Build](https://img.shields.io/badge/CI-CD%20via%20GitHub%20Actions-success)
![Live](https://img.shields.io/badge/Demo-Online-green)

🔗 **Live Site**: [https://digital-e.vercel.app](https://digital-e.vercel.app)  
📘 **Frontend + Backend**: This repo (monorepo style)

---

## 🧠 Overview

Digital-E is a monorepo implementation of a modern e-commerce platform. It pairs a React/Vite frontend with an Express backend and includes:

- Secure JWT authentication with refresh tokens and CSRF protection
- Product catalog, cart, wishlist, orders, and reviews
- Modular backend controllers, routes, and middleware
- Client-side API service layer and lazy-loaded UI
- Vercel-friendly deployment configuration

---

## 🔧 Tech Stack

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| Frontend    | React 19, Vite, TypeScript/JS, SCSS             |
| Backend     | Node.js, Express 5, Axios, CSRF                 |
| Database    | MySQL / relational storage                      |
| Auth        | JWT (access + refresh tokens), cookies          |
| Deployment  | Vercel, GitHub Actions                          |
| Tooling     | pnpm, ESLint, Prettier, Vitest                  |

---

## ✨ Features

- ✅ User sign up / sign in with protected routes
- ✅ Role-based admin/user endpoints
- ✅ Product browsing with filters and search
- ✅ Cart and wishlist management
- ✅ Order creation and purchase history
- ✅ Reviews and ratings
- ✅ Responsive UI with lazy loading and optimization

## 📁 Project Structure

```bash
digital-e-shop/
├── client/                   # Frontend application (React + Vite)
│   ├── assets/               # Static assets (images, icons, fonts)
│   ├── components/           # Reusable UI components
│   ├── context/              # API React Contexts
│   ├── services/             # API logic and helpers
│   ├── App.tsx               # Main app component
│   └── main.tsx              # React DOM render
│
├── server/                   # Backend application (Express.js)
│   ├── utils/                # API route definitions
│   ├── database/             # DB schema, seed, and migration files
│   ├── model.js              # Request handlers
│   └── app.js                # Server entry point
│
├── package.json              # Project metadata and scripts
├── vite.config.ts            # Frontend bundler configuration
└── README.md                 # Project overview and documentation

```

- **Client**: React frontend bootstrapped with Vite, state managed locally with hooks.
- **Server**: RESTful API using Express.js and custom middlewares.
- **Database**: Structured relational tables: `users`, `products`, `orders`, `order_items`.

---

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18
- pnpm package manager
- MySQL local or cloud database
- Optional: Vercel account for deployment

### Install dependencies

```bash
cd client
pnpm install
cd ../server
pnpm install
```

### Run locally

```bash
# Start backend
cd server
pnpm start

# In another terminal, start frontend
cd ../client
pnpm start
```

### Useful scripts

- `cd client && pnpm start` — Run frontend development server
- `cd client && pnpm build` — Build frontend for production
- `cd client && pnpm lint` — Lint frontend source files
- `cd client && pnpm test` — Run frontend tests
- `cd server && pnpm start` — Start backend with nodemon

---

## 📌 Notes

- This repository uses separate `client/` and `server/` packages, not a single root package.
- The backend includes CSRF protection and a Vercel-compatible API entrypoint.
- Frontend API logic is centralized under `client/src/api` and `client/src/services`.

---

## 🔮 Roadmap

- Admin dashboard with product management
- Payment provider integration (Stripe/PayPal)
- Enhanced review moderation and product ratings
- Docker support for local development
- Expanded end-to-end test coverage
