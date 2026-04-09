import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // Connect through Vite proxy (dev) or relative path (prod)
    // Vite proxy in vite.config.ts routes /socket.io to localhost:8080
    socket = io(window.location.origin, {
      path: '/socket.io',
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}
