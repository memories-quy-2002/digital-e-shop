# 🛒 Digital-E — Full-stack E-commerce Platform

> A scalable, performance-optimized e-commerce platform built with React.js, Node.js, and MySQL. Features secure authentication, shopping cart, order flow, and CI/CD deployment via Vercel.

![Tech Stack](https://img.shields.io/badge/Stack-Full--stack-blueviolet)
![Build](https://img.shields.io/badge/CI-CD%20via%20GitHub%20Actions-success)
![Live](https://img.shields.io/badge/Demo-Online-green)

🔗 **Live Site**: [https://digital-e.vercel.app](https://digital-e.vercel.app)  
💻 **Backend Repo**: _coming soon if separated_  
📘 **Frontend + Backend**: This repo (monorepo style)

---

## 🧠 Overview

Digital-E was designed and developed as a realistic, production-ready e-commerce platform featuring:

- Secure JWT-based authentication with role access control
- Dynamic product catalog & cart functionality
- Persistent orders and admin dashboard (conceptual)
- Modular API architecture
- CI/CD integration for seamless deployment

---

## 🔧 Tech Stack

| Layer       | Technology                     |
|-------------|--------------------------------|
| Frontend    | React.js, React Router, Vite, SCSS |
| Backend     | Node.js, Express.js            |
| Database    | MySQL (hosted via Aiven Database) |
| Auth        | JWT (access + refresh token)   |
| DevOps      | GitHub Actions + Vercel        |
| Linting     | ESLint, Prettier               |
| Tools       | Postman, Figma (UI prototype)  |

---

## ✨ Features

- ✅ User Sign Up / Sign In with access & refresh tokens  
- ✅ Role-based access control (admin/user)  
- ✅ Add-to-cart, remove-from-cart, and live item count  
- ✅ Order simulation & user purchase history  
- ✅ Lazy loading of assets and routes  
- ✅ GitHub Actions pipeline + Vercel auto-deploy  
- ✅ Lighthouse score: **90+** across performance metrics

## 📁 Project Structure (Simplified)

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

### Clone the repository
```bash
git clone https://github.com/memories-quy-2002/digital-e-shop.git
cd digital-e-shop
```

### Prerequisites

- Node.js ≥ v18
- MySQL local or cloud DB (PlanetScale recommended)
- Vercel account (optional)

### Local Setup

```bash
# Clone repository
git clone https://github.com/memories-quy-2002/digital-e-shop.git
cd digital-e-shop

# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

## 📊 Performance
- ✅ Lazy-loaded routes
- ✅ Image optimization
- ✅ Bundle splitting (via Vite)
- ✅ Lighthouse Score:
  + Performance: 91
  + Accessibility: 95
  + Best Practices: 100
  + SEO: 90

## 📌 Lessons Learned
- Implemented custom JWT token refresh & storage logic
- Designed normalized DB schema with referential integrity
- Configured zero-downtime CI/CD with GitHub Actions + Vercel
- Debugged async/await flow with protected routes
- Built for responsiveness across device breakpoints

## 🔮 Roadmap (Planned)
- Admin dashboard with product management
- Stripe/PayPal integration (mock only)
- Review system and product ratings
- Global state using Redux Toolkit or Zustand
- Dockerization for scalable deployment
