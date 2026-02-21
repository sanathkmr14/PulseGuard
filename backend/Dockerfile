FROM node:18-slim

WORKDIR /app

# Install dependencies (Debian/Slim use apt-get)
COPY package*.json ./
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Start command
CMD ["npm", "start"]
