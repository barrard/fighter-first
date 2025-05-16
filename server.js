// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import cors from "cors";
import CharacterController from "./controllers/Characters.js";
import userRoutes from "./routes/users.js";

const app = express();
const server = http.createServer(app);
var corsOptions = {
    origin: "http://localhost:5173",
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
    methods: ["GET", "POST"],
    // allowedHeaders: ["my-custom-header"],
    credentials: true,
};

const io = new Server(server, {
    cors: corsOptions,
    // {
    //     origin: corsOptions.origin,
    //     methods: ["GET", "POST"],
    //     allowedHeaders: ["my-custom-header"],
    //     credentials: true,
    // },
});
// import Basic from "./public/js/Characters/Basic.js";
const port = process.env.NODE_ENV === "development" ? 3000 : 1548;

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // This is for form submissions if needed

// Serve static files from the public directory
app.use(express.static("public"));

// Serve index.html for the root route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use("/api/users", userRoutes);

// Game constants
// Add these new constants for fighting mechanics
const PUNCH_DURATION = 300; // milliseconds
const KICK_DURATION = 400; // milliseconds
const ARM_WIDTH = 30; // pixels
const ARM_HEIGHT = 10; // pixels
const ARM_Y_OFFSET = 30; // 70px from top of 100px character
const LEG_WIDTH = 35; // pixels
const LEG_HEIGHT = 8; // pixels
const LEG_Y_OFFSET = 70; // Position from top of character

const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 100;
const MOVEMENT_SPEED = 5; // Pixels per frame
const MAX_WIDTH = 1920; // Default max width, will be overridden by client window size
const JUMP_VELOCITY = -15;
const GRAVITY = 0.8;
const FLOOR_Y = 800; // This should match your client calculation
const FLOOR_HEIGHT = 40; // or some other value
const AIR_RESISTANCE = 0.02;
const GROUND_FRICTION = 0.2;
const ONE_SECOND = 1000;
const FPS_SERVER = 20;
const SERVER_FPS_TIME = ONE_SECOND / FPS_SERVER;
let lastTimeSent = 0;
let serverTick = 0;
let dataSent = 0;
let lastServerTick = 0;

// Game state
const gameState = {
    players: new Map(),
    timestamp: Date.now(),
};

function handlePlayerInput(player) {
    const nextInput = player.batchInput.shift();
    if (!nextInput) {
        console.log("nextInput shegone");
        player.nextInput = player.lastInput;
    } else {
        player.nextInput = nextInput;
        player.lastInput = nextInput;
    }
    if (!player.nextInput) return;

    const { currentTick, keysPressed } = player.nextInput;

    // Check if player is on ground or in air
    const onGround = !player.isJumping;

    // const lastKeysPressed = player.batchInput[player.batchInput.length - 1];
    // const tickData = { ...keysPressed, tick: currentTick };
    if (!player.currentTick) {
        player.currentTick = currentTick;
    } else {
        //tick should only be 1++
        const tickDiff = currentTick - player.currentTick;
        if (tickDiff > 1) {
            console.log("do something");
            player.currentTick = currentTick;
        } else {
            // console.log("aalss good");
            player.currentTick = currentTick;
        }
    }

    //SAVE
    // player.batchInput.push(tickData);
    // if (player.batchInput.length > 10) {
    //     player.batchInput.shift();
    // }

    // player.isMoving = false;

    // Only apply horizontal movement changes if on ground
    if (onGround) {
        // ON GROUND: Direct control with no momentum
        if (keysPressed.ArrowLeft && !keysPressed.ArrowRight) {
            player.movingDirection = "ArrowLeft";
            // player.isMoving = true;
            // player.horizontalVelocity = -MOVEMENT_SPEED;
        } else if (keysPressed.ArrowRight && !keysPressed.ArrowLeft) {
            player.movingDirection = "ArrowRight";
            // player.isMoving = true;
            // player.horizontalVelocity = MOVEMENT_SPEED;
        } else if (!keysPressed.ArrowLeft && !keysPressed.ArrowRight) {
            player.movingDirection = null;
            player.horizontalVelocity = 0;
        } else if (keysPressed.ArrowLeft && keysPressed.ArrowRight) {
            player.movingDirection = null;
            player.horizontalVelocity = 0;
        }
        if (!keysPressed.ArrowUp && !keysPressed.ArrowRight && !keysPressed.ArrowLeft) {
            // player.isMoving = false;
            player.horizontalVelocity = 0;
            player.movingDirection = null;
        }
        if (keysPressed.ArrowUp && !player.isJumping) {
            // Apply jump if needed (only if on ground)
            // player.isMoving = true;
            player.isJumping = true;
            player.verticalVelocity = JUMP_VELOCITY;
        }
    } else {
        // IN AIR: Still update direction for rendering/facing but don't change velocity
        // player.isMoving = true;
        console.log(player.movingDirection);
    }

    // Handle actions
    if (keysPressed.KeyP && !player.isPunching) {
        player.isPunching = true;
    } else {
        player.isPunching = false;
    }

    if (keysPressed.KeyK && !player.isKicking) {
        player.isKicking = true;
    } else {
        player.isKicking = false;
    }
}

function addInputBatchToPlayer(batchInput, socket) {
    const playerId = socket.id;
    const player = gameState.players.get(playerId);
    if (!player) return;
    player.batchInput = [
        ...player.batchInput,
        ...batchInput.keysPressed.map((keysPressed) => ({ keysPressed, currentTick: batchInput.currentTick })),
    ];
    // console.log("player.batchInput.length", player.batchInput.length);
}

// Game loop for authoritative movement
// setInterval(() => {
//     serverTick++;
//     // let updated = false;

//     // Update player facing directions based on opponents' positions
//     updatePlayerFacingDirections();

//     // Update all players
//     gameState.players.forEach((player) => {
//         handlePlayerInput(player);
//         // console.log(player.movingDirection);
//         player.serverTick = serverTick;
//         // let positionChanged = false;

//         // Check if player is on the ground
//         const onGround = !player.isJumping;

//         // console.log({
//         //     "player.horizontalVelocity": player.horizontalVelocity,
//         //     "player.movingDirection": player.movingDirection,
//         // });
//         // Apply movement based on input and current state
//         // if (onGround) {
//         // ON GROUND: Direct control with no momentum
//         // if (player.isMoving) {
//         if (player.movingDirection === "ArrowLeft") {
//             player.horizontalVelocity = -MOVEMENT_SPEED;
//             // positionChanged = true;
//         } else if (player.movingDirection === "ArrowRight") {
//             player.horizontalVelocity = MOVEMENT_SPEED;
//             // positionChanged = true;
//         } else {
//             // Stop immediately when on ground and no movement input
//             player.horizontalVelocity = 0;
//         }
//         // if (!player.isJumping) {
//         //     // Stop immediately when on ground and no movement input
//         //     player.horizontalVelocity = 0;
//         // }
//         // }

//         // Apply horizontal movement
//         if (player.horizontalVelocity !== 0) {
//             player.x += player.horizontalVelocity;
//             player.x = Math.max(0, Math.min(5000 - PLAYER_WIDTH, player.x)); // Some large value as a safeguard
//             // positionChanged = true;
//         }

//         // Handle jumping and gravity
//         if (player.isJumping) {
//             player.height -= player.verticalVelocity;
//             player.verticalVelocity += GRAVITY;
//             // positionChanged = true;

//             // Check if player has landed
//             if (player.height <= 0) {
//                 player.height = 0;
//                 player.verticalVelocity = 0;
//                 player.isJumping = false;

//                 // Stop horizontal momentum on landing
//                 // player.horizontalVelocity = 0;

//                 // If still receiving movement input, apply ground movement
//                 // if (player.isMoving) {
//                 //     if (player.movingDirection === "ArrowLeft") {
//                 //         player.horizontalVelocity = -MOVEMENT_SPEED;
//                 //     } else if (player.movingDirection === "ArrowRight") {
//                 //         player.horizontalVelocity = MOVEMENT_SPEED;
//                 //     }
//                 // }
//             }
//         }

//         // if (positionChanged) {
//         //     updated = true;
//         // }
//     });

//     // Broadcast updated positions

//     const timeSent = Date.now();
//     // console.log("serverTick", serverTick);
//     // const timeDiff = timeSent - lastTimeSent;
//     const tickDiff = serverTick - lastServerTick;

//     if (tickDiff == 3) {
//         dataSent++;

//         lastServerTick = serverTick;
//         lastTimeSent = timeSent;
//         const players = Array.from(gameState.players.values()).map((player) => ({
//             id: player.id,
//             x: player.x,
//             currentTick: player.currentTick,
//             height: player.height,
//             facing: player.facing,
//             isJumping: player.isJumping,
//             isKicking: player.isKicking,
//             isPunching: player.isPunching,
//             verticalVelocity: player.verticalVelocity,
//             horizontalVelocity: player.horizontalVelocity, // Add this line
//             lastProcessedInput: player.lastProcessedInput || 0,
//             serverTick: player.serverTick,
//         }));
//         io.emit("gameState", { players });
//     }
//     // }

//     // }
// }, 1000 / 61); // ~60 fps

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

const gameRooms = {};
const socketNames = {};

function checkForUsername(socket) {
    const cookies = socket.handshake.headers.cookie;

    // Parse cookies (simple version)
    const parseCookies = (cookieString) => {
        const cookies = {};
        if (cookieString) {
            cookieString.split(";").forEach((cookie) => {
                const [name, value] = cookie.trim().split("=");
                cookies[name] = value;
            });
        }
        return cookies;
    };

    const parsedCookies = parseCookies(cookies);
    const encodedUsername = parsedCookies.username;

    if (encodedUsername) {
        // Decode the URL-encoded username
        const username = decodeURIComponent(encodedUsername);

        // You can emit the username back to the client
        socket.emit("userData", { username });
        socketNames[socket.id] = username;
        // Or use it for socket-specific operations
        console.log(`User ${username} connected`);
    } else {
        socket.emit("userData", { username: null });
    }
}
// Socket.io connection handling
io.on("connection", (socket) => {
    checkForUsername(socket);

    console.log("A user connected", socket.id);

    socket.on("characterSelected", (selectedChar) => {
        //get the type of socket, player1 player2 or spectator
        const room = GameRoom.socketIdToRoom[socket.id];
        const isPlayer1 = room.player1.id == socket.id;
        const isPlayer2 = room.player2.id == socket.id;

        if (!isPlayer1 && !isPlayer2) {
            socket.emit("error", { message: "You are not a player in this room" });
            return;
        }
        const character = CharacterController.verifyCharacter(selectedChar.id);
        if (!character) {
            socket.emit("error", { message: "Character not found" });
            return;
        }

        const username = socketNames[socket.id];
        if (isPlayer1) {
            room.player1.character = character;
        } else if (isPlayer2) {
            room.player2.Character = character;
        }

        io.to(room.roomName).emit("characterSelected", {
            isPlayer1,
            character,
            username,
        });
    });

    socket.on("verifyRoom", (roomName) => {
        roomName = encodeURIComponent(roomName);
        const inRoom = socket.rooms.has(roomName);
        const room = gameRooms[roomName];

        //will be player1, player2, or spectator
        const inRoomAs = room?.inRoomAs(socket);
        if (!inRoomAs || inRoomAs == "unknown") {
            if (!inRoom) {
                //remove from room
                socket.leave(roomName);
            }
            socket.emit("error", { message: "You are not in this room" });
        } else if (inRoomAs !== "unknown" && inRoom) {
            socket.emit("roomVerified", inRoomAs);
        }
    });
    socket.join("waitingRoom");

    socket.on("joinRoom", ({ roomName }) => {
        roomName = encodeURIComponent(roomName);
        console.log("joinRoom", socket.id, roomName);
        const room = gameRooms[roomName];
        if (!room) {
            socket.emit("error", { message: "Room not found" });
            return;
        }
        room.addSocketToRoom(socket);
        // socket.join(roomName);
        // socket.emit("joinGameRoom", { username, roomName });
    });

    socket.on("leaveRoom", (roomName) => {
        console.log("leaveRoom", socket.id, roomName);
        const room = gameRooms[roomName];
        if (!room) {
            socket.emit("error", { message: "Room not found" });
            return;
        }
        room.removeSocketFromRoom(socket);
    });

    socket.on("createRoom", ({ roomName }) => {
        console.log("createRoom", roomName);
        roomName = encodeURIComponent(roomName);

        if (gameRooms[roomName]) {
            socket.emit("error", { message: "Room name already exists" });
            return;
        }
        const newRoom = new GameRoom({ owner: socket.id, roomName });
        socket.broadcast.emit(
            "roomsList",
            Object.values(gameRooms).map((gr) => gr.toDto())
        );
        newRoom.addSocketToRoom(socket);
        gameRooms[roomName] = newRoom;
    });

    socket.on("getRooms", () => {
        socket.emit(
            "roomsList",
            Object.values(gameRooms).map((gr) => gr.toDto())
        );
    });
    socket.emit(
        "roomsList",
        Object.values(gameRooms).map((gr) => gr.toDto())
    );
    socket.on("ping", (data) => {
        // Echo back the client's timestamp
        socket.emit("pong", {
            clientTimestamp: data.clientTimestamp,
            serverTimestamp: Date.now(),
        });
    });

    // const BasicPlayer = new Basic({ socket });
    // Create a new player
    const playerId = socket.id;
    const player = {
        id: playerId,
        x: 100, // Start position
        height: 0, // Height above floor (0 = on floor, positive = above floor)
        color: "#" + Math.floor(Math.random() * 16777215).toString(16),
        // isMoving: false,
        movingDirection: null,
        horizontalVelocity: 0,
        isJumping: false,
        verticalVelocity: 0,
        facing: "right", // Default facing direction
        batchInput: [],
        serverTick: serverTick,
        currentTick: 0,
        currentFrame: 0,
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

    socket.on("playerInputBatch", (data) => addInputBatchToPlayer(data, socket));

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

class GameRoom {
    static socketIdToRoom = {};

    constructor({ owner, roomName }) {
        this.roomName = roomName;
        this.owner = owner;
        this.spectators = {};
        this.player1 = {};
        this.player2 = {};
    }

    toDto() {
        return {
            roomName: decodeURIComponent(this.roomName),
            player1: this.player1.id,
            player2: this.player2.id,
            spectators: Object.keys(this.spectators),
        };
    }

    inRoomAs(socket) {
        if (this.player1.id == socket?.id) return "player1";
        if (this.player2.id == socket?.id) return "player2";
        else if (this.spectators[socket?.id]) return "spectator";
        return "unknown";
    }
    removeSocketFromRoom(socket) {
        socket.leave(this.roomName);
        GameRoom.socketIdToRoom[socket.id] = null;
    }

    addSocketToRoom(socket) {
        let asPlayerType = "";
        if (!this.player1.id) {
            this.player1 = socket;
            asPlayerType = "player1";
        } else if (!this.player2.id) {
            this.player2 = socket;
            asPlayerType = "player2";
        } else {
            this.spectators[socket.id] = socket;
            asPlayerType = "spectator";
        }

        GameRoom.socketIdToRoom[socket.id] = this;

        socket.join(this.roomName);
        console.log(`${socket.id} joined ${this.roomName}`);
        socket.emit("joinGameRoom", {
            roomName: this.roomName,
            asPlayerType,
            player1: this.player1.id,
            player2: this.player2.id,
            spectators: Object.keys(this.spectators),
        });
    }
}
