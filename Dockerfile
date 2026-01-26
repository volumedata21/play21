# Stage 1: Build the frontend
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./
RUN npm install

# Copy everything else, including index.html and tsconfig.json
COPY . .

# Run the build [cite: 2]
RUN npm run build 

# Stage 2: Final Production Image
FROM node:20-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package*.json ./
RUN npm install --production

# Copy the built frontend from Stage 1
COPY --from=builder /app/dist ./dist

# Copy the server and remaining files 
COPY . .

EXPOSE 3001

# Use JSON array format for CMD to fix the warning and handle OS signals correctly
CMD ["node", "server/index.js"]