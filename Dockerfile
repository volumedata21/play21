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

# 1. Install FFmpeg AND Intel Drivers
# FIX: Added "non-free" to the source list so apt can find the driver
RUN echo "deb http://deb.debian.org/debian bookworm main non-free non-free-firmware" > /etc/apt/sources.list.d/non-free.list && \
    apt-get update && \
    apt-get install -y \
    ffmpeg \
    intel-media-va-driver-non-free \
    libva-drm2 \
    libmfx1 \
    vainfo \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Install ONLY production dependencies
COPY package*.json ./
RUN npm install --production

# 3. Copy the server code specifically
COPY server ./server

# 4. Copy the built frontend from Stage 1
COPY --from=builder /app/dist ./dist

# 5. Create necessary data directories
RUN mkdir -p media data

EXPOSE 3001

# Start the server
CMD ["node", "server/index.js"]