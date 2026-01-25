# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package files first to install dependencies
# (This caches the install step so rebuilds are faster)
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy the rest of your app's source code
COPY . .

# Expose the port your app runs on (matching your vite.config.ts)
EXPOSE 3000

# The command to start your app
CMD ["npm", "run", "dev"]