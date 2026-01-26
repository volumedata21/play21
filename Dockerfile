# Stage 1: Build the frontend
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build [cite: 2]

# Stage 2: Final Production Image
FROM node:20-slim
# Install FFmpeg for your video processing
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install --production
# Copy the built frontend from Stage 1 
COPY --from=builder /app/dist ./dist
# Copy the rest of the server files
COPY . . 

EXPOSE 3001
CMD ["node", "server/index.js"] [cite: 3]