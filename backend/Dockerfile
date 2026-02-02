# backend/Dockerfile

# Base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the Prisma schema and generate the client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy the rest of the application code
COPY . .

# Build the TypeScript code (outputs to dist/)
RUN npm run build

# Expose the port defined in your index.ts (usually 3000)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]