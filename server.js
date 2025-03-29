// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
var cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.NODE_ENV === "development" ? 3000 : 1548;

var corsOptions = {
    origin: "http://localhost:8080",
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));

// Serve static files from the public directory
app.use(express.static("public"));

// Serve index.html for the root route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Game constants
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 100;
const MOVEMENT_SPEED = 5; // Pixels per frame
const MAX_WIDTH = 1920; // Default max width, will be overridden by client window size
const JUMP_VELOCITY = -15;
const GRAVITY = 0.8;
const FLOOR_Y = 800; // This should match your client calculation
const FLOOR_HEIGHT = 40; // or some other value
const MAX_HORIZONTAL_VELOCITY = 8;
const AIR_RESISTANCE = 0.02;
const GROUND_FRICTION = 0.2;

// Game state
const gameState = {
    players: new Map(),
    timestamp: Date.now(),
};

// Game loop for authoritative movement
setInterval(() => {
    let updated = false;

    // Update player facing directions based on opponents' positions
    updatePlayerFacingDirections();

    // Update all players
    gameState.players.forEach((player) => {
        let positionChanged = false;

        // Check if player is on the ground
        const onGround = !player.isJumping;

        // Apply movement based on input and current state
        if (onGround) {
            // ON GROUND: Direct control with no momentum
            if (player.isMoving) {
                if (player.movingDirection === "ArrowLeft") {
                    player.horizontalVelocity = -MOVEMENT_SPEED;
                    // positionChanged = true;
                } else if (player.movingDirection === "ArrowRight") {
                    player.horizontalVelocity = MOVEMENT_SPEED;
                    // positionChanged = true;
                }
            } else {
                // Stop immediately when on ground and no movement input
                player.horizontalVelocity = 0;
            }
        } else {
            // IN AIR: Maintain momentum with no control
            // Only mark position as changed if already moving horizontally
            if (player.horizontalVelocity !== 0) {
                // positionChanged = true;
            }
            // No adjustments to velocity in the air - maintain momentum
        }

        // Apply horizontal movement
        if (player.horizontalVelocity !== 0) {
            player.x += player.horizontalVelocity;
            player.x = Math.max(0, Math.min(5000 - PLAYER_WIDTH, player.x)); // Some large value as a safeguard
            // positionChanged = true;
        }

        // Handle jumping and gravity
        if (player.isJumping) {
            player.height -= player.verticalVelocity;
            player.verticalVelocity += GRAVITY;
            // positionChanged = true;

            // Check if player has landed
            if (player.height <= 0) {
                player.height = 0;
                player.verticalVelocity = 0;
                player.isJumping = false;

                // Stop horizontal momentum on landing
                player.horizontalVelocity = 0;

                // If still receiving movement input, apply ground movement
                if (player.isMoving) {
                    if (player.movingDirection === "ArrowLeft") {
                        player.horizontalVelocity = -MOVEMENT_SPEED;
                    } else if (player.movingDirection === "ArrowRight") {
                        player.horizontalVelocity = MOVEMENT_SPEED;
                    }
                }
            }
        }

        // if (positionChanged) {
        //     updated = true;
        // }
    });

    // Broadcast updated positions
    // if (updated) {
    // Always broadcast all players to ensure facing directions are updated
    const updatedPlayers = Array.from(gameState.players.values()).map((player) => ({
        id: player.id,
        x: player.x,
        height: player.height,
        facing: player.facing,
        isJumping: player.isJumping,
        isKicking: player.isKicking,
        isPunching: player.isPunching,
        verticalVelocity: player.verticalVelocity,
        horizontalVelocity: player.horizontalVelocity, // Add this line
        lastProcessedInput: player.lastProcessedInput || 0,
    }));

    io.emit("gameState", { players: updatedPlayers });
    // }
}, 16.7); // ~20 fps

// Function to update player facing directions
function updatePlayerFacingDirections() {
    // Skip if there are fewer than 2 players
    if (gameState.players.size < 2) return;

    // Convert players to array for easier processing
    const playerArray = Array.from(gameState.players.values());

    // For each player, compare position with all other players and face the closest one
    playerArray.forEach((player) => {
        let closestDistance = Infinity;
        let closestPlayer = null;

        // Find the closest opponent
        playerArray.forEach((opponent) => {
            if (opponent.id !== player.id) {
                const distance = Math.abs(opponent.x - player.x);
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPlayer = opponent;
                }
            }
        });

        // Update facing direction based on closest opponent
        if (closestPlayer) {
            if (closestPlayer.x > player.x) {
                player.facing = "right";
            } else {
                player.facing = "left";
            }
        }
    });
}

// Socket.io connection handling
io.on("connection", (socket) => {
    console.log("A user connected", socket.id);

    socket.on("ping", (data) => {
        // Echo back the client's timestamp
        socket.emit("pong", {
            clientTimestamp: data.clientTimestamp,
            serverTimestamp: Date.now(),
        });
    });

    // Create a new player
    const playerId = socket.id;
    const player = {
        id: playerId,
        x: 100, // Start position
        height: 0, // Height above floor (0 = on floor, positive = above floor)
        color: "#" + Math.floor(Math.random() * 16777215).toString(16),
        isMoving: false,
        movingDirection: null,
        horizontalVelocity: 0,
        isJumping: false,
        verticalVelocity: 0,
        facing: "right", // Default facing direction
        keysPressedHistory: [],
    };

    // Add player to game state
    gameState.players.set(playerId, player);

    // Send initial state to the new player
    socket.emit("init", {
        playerId: playerId,
        players: Array.from(gameState.players.values()),
    });

    // Broadcast new player to all other players
    socket.broadcast.emit("playerJoined", player);

    socket.on("playerInputBatch", (batchData) => {
        const playerId = batchData.playerId || socket.id;
        const player = gameState.players.get(playerId);
        if (!player) return;

        const { currentTick, keysPressed } = batchData;

        // Check if player is on ground or in air
        const onGround = !player.isJumping;

        const lastKeysPressed = player.keysPressedHistory[player.keysPressedHistory.length - 1];
        const tickData = { ...keysPressed, tick: currentTick };
        player.currentTick = currentTick;
        player.keysPressedHistory.push(tickData);
        if (player.keysPressedHistory.length > 10) {
            player.keysPressedHistory.shift();
        }
        // Only apply horizontal movement changes if on ground
        if (onGround) {
            // ON GROUND: Direct control with no momentum
            if (keysPressed.ArrowLeft) {
                player.movingDirection = "ArrowLeft";
                player.isMoving = true;
                player.horizontalVelocity = -MOVEMENT_SPEED;
            } else if (keysPressed.ArrowRight) {
                player.movingDirection = "ArrowRight";
                player.isMoving = true;
                player.horizontalVelocity = MOVEMENT_SPEED;
            } else {
                player.isMoving = false;
                player.horizontalVelocity = 0;
            }
            // Apply jump if needed (only if on ground)
            if (keysPressed.ArrowUp && !player.isJumping) {
                player.isJumping = true;
                player.verticalVelocity = JUMP_VELOCITY;
            }
        } else {
            // IN AIR: Still update direction for rendering/facing but don't change velocity
            if (keysPressed.ArrowLeft) {
                player.movingDirection = "ArrowLeft";
                player.isMoving = true;
                // Do NOT update horizontalVelocity while in air
            } else if (keysPressed.ArrowRight) {
                player.movingDirection = "ArrowRight";
                player.isMoving = true;
                // Do NOT update horizontalVelocity while in air
            } else {
                player.isMoving = false;
                // Do NOT update horizontalVelocity while in air
            }
        }

        // Handle actions
        if (keysPressed.KeyP && !player.isPunching) {
            player.isPunching = true;
            // socket.broadcast.emit("playerPunched", socket.id);
        } else {
            player.isPunching = false;
        }

        if (keysPressed.KeyK && !player.isKicking) {
            player.isKicking = true;
            // socket.broadcast.emit("playerKicked", socket.id);
        } else {
            player.isKicking = false;
        }
        // });
    });

    // Handle player disconnection
    socket.on("disconnect", () => {
        console.log("User disconnected", playerId);
        gameState.players.delete(playerId);
        io.emit("playerLeft", playerId);
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
