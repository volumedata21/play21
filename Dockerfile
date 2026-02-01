# Stage 1: Build the frontend
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Final Production Image
FROM node:20-slim

# 1. Install FFmpeg for video processing/transcoding
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Install ONLY production dependencies (keeps image small)
COPY package*.json ./
RUN npm install --production

# 3. Copy the server code specifically
# (We do NOT use 'COPY . .' here to avoid overwriting dependencies)
COPY server ./server

# 4. Copy the built frontend from Stage 1
COPY --from=builder /app/dist ./dist

# 5. Create necessary data directories
RUN mkdir -p media data

EXPOSE 3001

# Start the server
CMD ["node", "server/index.js"]