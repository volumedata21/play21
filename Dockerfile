# Use standard Node 20 (Debian-based)
FROM node:20

# Install FFmpeg (The tool that can "see" video frames)
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

EXPOSE 3000 3001

CMD ["npm", "run", "dev"]