const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuración
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));

// Estado del juego
let gameState = {
    snakes: {
        1: [], // Jugador 1 (azul)
        2: []  // Jugador 2 (naranja)
    },
    apples: [],
    scores: { 1: 0, 2: 0 },
    directions: { 1: 'right', 2: 'left' },
    gameRunning: false,
    detectionRunning: false
};

// WebSocket Connection
io.on('connection', (socket) => {
    console.log(`Nueva conexión: ${socket.id}`);

    // Enviar estado inicial
    socket.emit('game-state', gameState);

    // Actualizar contador de espectadores
    updateSpectatorCount();

    // Manejar controles del juego
    socket.on('start-detection', () => {
        gameState.detectionRunning = true;
        broadcastGameState();
    });

    socket.on('stop-detection', () => {
        gameState.detectionRunning = false;
        broadcastGameState();
    });

    socket.on('start-game', () => {
        initGame();
        broadcastGameState();
    });

    socket.on('reset-game', () => {
        resetGame();
        broadcastGameState();
    });

    socket.on('update-direction', (data) => {
        if (gameState.gameRunning && [1, 2].includes(data.player)) {
            gameState.directions[data.player] = data.direction;
        }
    });

    socket.on('disconnect', () => {
        console.log(`Conexión cerrada: ${socket.id}`);
        updateSpectatorCount();
    });
});

// Función para actualizar contador de espectadores
function updateSpectatorCount() {
    io.emit('spectator-count', io.engine.clientsCount);
}

// Función para transmitir estado del juego
function broadcastGameState() {
    io.emit('game-state', gameState);
}

// Funciones del juego
function initGame() {
    const gridSize = 20;
    const tileCount = 30;

    // Inicializar serpientes
    gameState.snakes = {
        1: Array.from({ length: 4 }, (_, i) => ({ x: (3 - i) * gridSize, y: 0 })),
        2: Array.from({ length: 4 }, (_, i) => ({ x: (tileCount - i - 1) * gridSize, y: (tileCount - 1) * gridSize }))
    };

    // Colocar 3 manzanas iniciales
    gameState.apples = [];
    for (let i = 0; i < 3; i++) {
        placeApple();
    }

    // Reiniciar puntuaciones y direcciones
    gameState.scores = { 1: 0, 2: 0 };
    gameState.directions = { 1: 'right', 2: 'left' };
    gameState.gameRunning = true;

    console.log('Juego iniciado');
}

function resetGame() {
    gameState.gameRunning = false;
    gameState.detectionRunning = false;
    console.log('Juego reiniciado');
}

function placeApple() {
    const gridSize = 20;
    const tileCount = 30;

    let apple;
    let validPosition = false;

    while (!validPosition) {
        apple = {
            x: Math.floor(Math.random() * tileCount) * gridSize,
            y: Math.floor(Math.random() * tileCount) * gridSize
        };

        validPosition = true;

        // Verificar colisión con serpientes
        for (const player in gameState.snakes) {
            for (const segment of gameState.snakes[player]) {
                if (segment.x === apple.x && segment.y === apple.y) {
                    validPosition = false;
                    break;
                }
            }
            if (!validPosition) break;
        }

        // Verificar colisión con otras manzanas
        if (validPosition) {
            for (const existingApple of gameState.apples) {
                if (existingApple.x === apple.x && existingApple.y === apple.y) {
                    validPosition = false;
                    break;
                }
            }
        }
    }

    gameState.apples.push(apple);
}

// Bucle del juego (actualiza cada 150ms)
setInterval(() => {
    if (gameState.gameRunning) {
        updateGame();
        broadcastGameState();
    }
}, 150);

function updateGame() {
    // Mover serpientes
    for (const player in gameState.snakes) {
        const snake = gameState.snakes[player];
        if (snake.length === 0) continue;

        const head = { ...snake[0] };

        // Actualizar posición según dirección
        switch (gameState.directions[player]) {
            case 'up': head.y -= 20; break;
            case 'down': head.y += 20; break;
            case 'left': head.x -= 20; break;
            case 'right': head.x += 20; break;
        }

        // Teletransportación en bordes
        if (head.x >= 600) head.x = 0;
        if (head.x < 0) head.x = 580;
        if (head.y >= 600) head.y = 0;
        if (head.y < 0) head.y = 580;

        // Comprobar colisiones
        checkCollisions(player, head);

        // Mover serpiente
        snake.unshift(head);

        // Comprobar si come manzana
        checkAppleCollision(player, head);
    }
}

function checkCollisions(player, head) {
    // Colisión consigo misma
    for (let i = 1; i < gameState.snakes[player].length; i++) {
        const segment = gameState.snakes[player][i];
        if (head.x === segment.x && head.y === segment.y) {
            resetSnake(player);
            return;
        }
    }

    // Colisión con otra serpiente
    const otherPlayer = player === '1' ? '2' : '1';
    for (let i = 1; i < gameState.snakes[otherPlayer].length; i++) {
        const segment = gameState.snakes[otherPlayer][i];
        if (head.x === segment.x && head.y === segment.y) {
            resetSnake(player);
            return;
        }
    }
}

function checkAppleCollision(player, head) {
    for (let i = 0; i < gameState.apples.length; i++) {
        if (head.x === gameState.apples[i].x && head.y === gameState.apples[i].y) {
            gameState.scores[player] += 10;
            gameState.apples.splice(i, 1);
            placeApple();
            return;
        }
    }

    // Si no comió, quitar cola
    gameState.snakes[player].pop();
}

function resetSnake(player) {
    gameState.scores[player] = 0;

    // Reiniciar serpiente a tamaño inicial
    gameState.snakes[player] = Array.from({ length: 4 }, (_, i) => ({
        x: (player === '1' ? (3 - i) : (36 + i)) * 20,
        y: player === '1' ? 0 : 580
    }));

    gameState.directions[player] = player === '1' ? 'right' : 'left';
}

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});