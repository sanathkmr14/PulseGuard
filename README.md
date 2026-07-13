# PulseGuard ⚡️

<div align="center">

[![PulseGuard](https://img.shields.io/badge/Project-PulseGuard-blue?style=for-the-badge)](https://github.com/sanathkmr14/PulseGuard) [![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/) [![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/) [![MongoDB](https://img.shields.io/badge/MongoDB-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/) [![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/) [![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

<br />

[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_It_Out-2ea44f?style=for-the-badge)](https://pulse-guard-flame.vercel.app)

</div>

**PulseGuard** is a robust, real-time uptime monitoring solution designed to track the availability and performance of your services. Built with a modern tech stack, it offers instant alerts, detailed analytics, and a live dashboard to ensure your systems are always up and running.

---

## 🚀 Key Features

- **Real-Time Monitoring:** Instant status updates powered by WebSockets and Redis Streams.
- **Multi-Protocol Support:** Monitor various services including HTTP/HTTPS, TCP, UDP, DNS, PING, SMTP, and SSL Certificates.
- **Instant Alerts:** Get notified immediately via Email (Brevo/Nodemailer) when a service goes down or experiences degraded performance.
- **Detailed Analytics:** Track uptime percentages, response times, and review comprehensive incident history logs.
- **Background Workers:** Highly scalable job processing and scheduling powered by BullMQ and Redis.
- **Interactive Dashboard:** Beautiful, responsive UI with real-time data visualization using Recharts.

---

## 🛠 Tech Stack

### Frontend
- **React.js:** Dynamic, component-based user interface.
- **Vite:** Lightning-fast build tool and development server.
- **Tailwind CSS:** Utility-first CSS framework for modern, responsive design.
- **Recharts:** Composable charting library for beautiful data visualization.
- **Socket.io-client:** Real-time bi-directional communication.

### Backend
- **Node.js & Express.js:** High-performance REST API.
- **MongoDB & Mongoose:** Flexible document database for storing users, monitors, and logs.
- **Redis & ioredis:** High-speed caching, Pub/Sub messaging, and Job Queues.
- **Socket.io:** Real-time event broadcasting to the frontend.
- **BullMQ:** Robust, Redis-based background job processing.
- **Jest & Supertest:** Comprehensive unit and integration testing suite.

---

## 📦 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Ensure you have the following installed on your system:
- **Node.js** (v18.0.0 or higher recommended)
- **MongoDB** (Local instance or MongoDB Atlas)
- **Redis** (Local instance or Cloud Redis)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sanathkmr14/PulseGuard.git
   cd PulseGuard
   ```

2. **Install dependencies for both backend and frontend:**
   ```bash
   npm run install:all
   ```
   *Alternatively, you can manually run `npm install` in both the `backend` and `frontend` directories.*

### Environment Variables

You will need to set up your environment variables for the backend to function correctly. Create a `.env` file in the `backend` directory and configure the required keys. A typical configuration looks like this:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret

# Email Service Configuration (e.g., Nodemailer/Brevo)
SMTP_HOST=your_smtp_host
SMTP_PORT=your_smtp_port
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
```

### Running the Application

You can start both the backend and frontend development servers concurrently using the root script:

```bash
npm run dev
```

- **Frontend:** `http://localhost:5173` (Vite default)
- **Backend API:** `http://localhost:5000`

---

## 🧪 Testing

The backend includes a comprehensive suite of unit and integration tests built with Jest.

To run the test suite, navigate to the `backend` directory:
```bash
cd backend
npm run test           # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Generate test coverage report
```

Alternatively, run tests from the root directory:
```bash
npm run test:all       # Run comprehensive protocol and e2e tests
```

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.
