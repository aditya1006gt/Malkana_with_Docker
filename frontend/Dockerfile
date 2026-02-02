# frontend/Dockerfile
FROM node:20-alpine as builder

# Define Build Arguments
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_URL

# Set them as Environment Variables for the build process
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
ENV VITE_URL=$VITE_URL

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve using Nginx
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]