export const URL = "http://localhost:3000";


// src/config.ts

interface Config {
  apiUrl: string;
  socketUrl: string;
  baseUrl: string;
}

// Use import.meta.env for Vite or process.env for Webpack/CRA
const env = import.meta.env; 

export const CONFIG: Config = {
  apiUrl: env.VITE_API_URL || "http://localhost:3000/api/v1",
  socketUrl: env.VITE_SOCKET_URL || "http://localhost:3000",
  baseUrl: env.VITE_URL || "http://localhost:3000",
};

// Optional: Throw an error in development if critical keys are missing
if (!CONFIG.apiUrl) {
  console.warn("⚠️ API_URL is not defined in the environment variables!");
}