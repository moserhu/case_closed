let socket = null;
let pendingMessages = [];

export function connectWebSocket(onConnectedCallback, onMessageCallback, options = {}) {
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    console.log('Already connected ✅');
    if (onConnectedCallback) onConnectedCallback();
    if (onMessageCallback) socket.onmessage = onMessageCallback;
    return;
  }

  socket = new WebSocket('ws://localhost:8080');
  console.log('Connecting to WebSocket...');

  window.socket = socket;

  socket.onopen = () => {
    console.log('WebSocket connected ✅');

    if (options.role === 'host' && options.roomCode && options.hostToken) {
      sendMessage({
        action: 'host_reconnect',
        roomCode: options.roomCode,
        hostToken: options.hostToken,
      });
    }

    pendingMessages.forEach((msg) => socket.send(msg));
    pendingMessages = [];

    if (onConnectedCallback) onConnectedCallback();
  };

  if (onMessageCallback) {
    socket.onmessage = onMessageCallback;
  }

  socket.onclose = () => {
    console.log('WebSocket disconnected ❌');
    if (options.onClose) options.onClose();
  };

  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

export function sendMessage(message) {
  const messageString = JSON.stringify(message);

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(messageString);
  } else {
    console.log('WebSocket not open yet, queueing message...');
    pendingMessages.push(messageString);
  }
}
