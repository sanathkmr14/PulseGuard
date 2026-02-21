FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN apk add --no-cache ca-certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Start command
CMD ["npm", "start"]
