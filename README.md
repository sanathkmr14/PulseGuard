# PulseGuard ⚡️

**PulseGuard** is a robust, real-time uptime monitoring solution designed to track the availability and performance of your services. Built with a modern tech stack, it offers instant alerts, detailed analytics, and a live dashboard.

## 🚀 Key Features

*   **Real-Time Monitoring:** Instant updates via WebSockets and Redis Streams.
*   **Multi-Protocol Support:** Monitor HTTP/HTTPS, TCP, UDP, DNS, PING and SSL Certificates.
*   **Instant Alerts:** Get notified immediately via Email (Brevo/Nodemailer) when a service goes down.
*   **Detailed Analytics:** Track uptime percentages, response times, and incident history.
*   **Status Pages:** (Optional) Public pages to showcase your system health.
*   **Background Workers:** Scalable job processing powered by BullMQ and Redis.

## 🛠 Tech Stack

### Backend
*   **Node.js & Express:** High-performance REST API.
*   **MongoDB:** Flexible document storage for users, monitors, and logs.
*   **Redis:** Caching, Pub/Sub, and Job Queues.
*   **Socket.IO:** Real-time bi-directional communication.
*   **BullMQ:** Robust background job processing.
*   **Docker:** Containerized for easy deployment.

### Frontend
*   **React:** Dynamic and responsive user interface.
*   **Vite:** Lightning-fast build tool.
*   **TailwindCSS:** Utility-first CSS framework for modern design.
*   **Recharts:** Beautiful data visualization.

## 📦 Getting Started

### Prerequisites
*   Node.js (v16+)
*   MongoDB
*   Redis

### Quick Start (Docker)

The easiest way to run PulseGuard is using Docker Compose.

\`\`\`bash
# 1. Clone the repository
git clone https://github.com/sanathkmr14/PulseGuard.git
cd PulseGuard

# 2. Configure Environment
# Rename .env.example to .env and fill in your details (MongoDB, Redis, Email API)

# 3. Start Services
docker-compose up -d --build
\`\`\`

Your app will be running at `http://localhost:80` (Frontend) and `http://localhost:5000` (Backend).

### Manual Setup

#### Backend
\`\`\`bash
cd backend
npm install
npm run dev
\`\`\`

#### Frontend
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

## 📂 Project Structure

\`\`\`
/
├── backend/      # Node.js API & Workers
│   ├── src/
│   ├── tests/
│   └── Dockerfile
├── frontend/     # React Application
│   ├── src/
│   └── Dockerfile
└── docker-compose.yml
\`\`\`

## ☁️ Deployment

PulseGuard is optimized for deployment on platforms like **Railway** and **DigitalOcean**. 

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for detailed instructions.

## 🤝 Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## 📄 License

MIT License.
