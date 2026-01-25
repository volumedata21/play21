# Use standard Node 20 (Debian-based) to ensure SQLite builds easily
FROM node:20

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (including SQLite compilation)
RUN npm install

# Copy source
COPY . .

# Expose both Frontend and Backend ports
EXPOSE 3000 3001

# Run the command that starts BOTH servers
CMD ["npm", "run", "dev"]