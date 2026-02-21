FROM node:18-slim

WORKDIR /app

# Install dependencies (Debian/Slim use apt-get)
COPY package*.json ./
RUN apt-get update && apt-get install -y ca-certificates && update-ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Start command
CMD ["npm", "start"]
