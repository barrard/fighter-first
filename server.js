// server.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import cors from "cors";
import CharacterController from "./controllers/Characters.js";
import userRoutes from "./routes/users.js";
import { performance } from "perf_hooks";
import GameRoom from "./classes/GameRoom.js";
const app = express();
const server = http.createServer(app);
const allowedOrigins = process.env.CLIENT_ORIGINS
    ? process.env.CLIENT_ORIGINS.split(",").map((origin) => origin.trim())
    : ["http://localhost:5173"];

var corsOptions = {
    origin: allowedOrigins,
    optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
    methods: ["GET", "POST"],
    // allowedHeaders: ["my-custom-header"],
    credentials: true,
};

const io = new Server(server, {
    cors: corsOptions,
});
io.engine.on("headers", (headers, req) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
        headers["Access-Control-Allow-Credentials"] = "true";
    }
});

const port = process.env.NODE_ENV === "development" ? 3000 : 1548;

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/users", userRoutes);

import characters from "./gameConfig/Characters.js";
app.get("/api/characters", (req, res) => {
    res.json(characters);
});

const socketNames = {};

function addInputBatchToPlayer(batchInput, socket) {
    const playerId = socket.id;
    const room = GameRoom.socketIdToRoom[playerId];
    if (!room) return;
    const player = room.gameState.players.get(playerId);
    if (!player) return;
    // Decompose batch and store each frame by its serverTick
    for (const frame of batchInput.keysPressed) {
        if (frame.serverTick !== undefined && frame.serverTick !== null) {
            player.inputBuffer[frame.serverTick] = frame;
        }
    }
    // Uncomment for input debugging:
    // const currentServerTick = room.gameLoopService.serverTick;
    // const ticks = batchInput.keysPressed.map(f => f.serverTick);
    // console.log(`[INPUT DEBUG] clientTicks=[${ticks}], serverTick=${currentServerTick}, simTick=${currentServerTick - 6}, bufferSize=${Object.keys(player.inputBuffer).length}`);
}

function checkForUsername(socket) {
    const cookies = socket.handshake.headers.cookie;

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
        const username = decodeURIComponent(encodedUsername);
        socket.emit("userData", { username });
        socketNames[socket.id] = username;
        console.log(`User ${username} connected`);
    } else {
        socket.emit("userData", { username: null });
    }
}

io.on("connection", (socket) => {
    checkForUsername(socket);

    console.log("A user connected", socket.id);
    socket.join("waitingRoom");

    socket.on("characterSelected", (selectedChar) => {
        const playerId = socket.id;
        const room = GameRoom.socketIdToRoom[playerId];
        if (!room) {
            socket.emit("error", { message: "You are not in a room" });
            return;
        }
        const isPlayer1 = room.player1Id == playerId;
        const isPlayer2 = room.player2Id == playerId;

        if (!isPlayer1 && !isPlayer2) {
            socket.emit("error", { message: "You are not a player in this room" });
            return;
        }
        const character = CharacterController.verifyCharacter(selectedChar.id);
        if (!character) {
            socket.emit("error", { message: "Character not found" });
            return;
        }

        const {
            width: characterWidth,
            height: characterHeight,
            movementSpeed,
            jumpVelocity,
            punchDuration,
            kickDuration,
            // Combat stats
            health,
            punchDamage,
            kickDamage,
            punchKnockback,
            kickKnockback,
            punchActiveStart,
            punchActiveEnd,
            kickActiveStart,
            kickActiveEnd,
        } = character.stats || {};

        const player = {
            id: playerId,
            x: 100,
            height: 0,
            color: character.color || "#" + Math.floor(Math.random() * 16777215).toString(16),
            movingDirection: null,
            horizontalVelocity: 0,
            isJumping: false,
            verticalVelocity: 0,
            facing: "right",
            inputBuffer: {},
            serverTick: 0,
            lastProcessedTick: 0,
            currentFrame: 0,
            characterWidth: characterWidth,
            characterHeight: characterHeight,
            movementSpeed,
            jumpVelocity,
            punchDuration,
            kickDuration,
            // Combat state
            health: health || 100,
            maxHealth: health || 100,
            punchDamage: punchDamage || 10,
            kickDamage: kickDamage || 15,
            punchKnockback: punchKnockback || 8,
            kickKnockback: kickKnockback || 12,
            punchActiveStart: punchActiveStart || 3,
            punchActiveEnd: punchActiveEnd || 8,
            kickActiveStart: kickActiveStart || 5,
            kickActiveEnd: kickActiveEnd || 12,
            attackState: null,
            hitStun: 0,
            knockbackVelocity: 0,
        };

        room.gameState.players.set(playerId, player);

        const username = socketNames[playerId];
        if (isPlayer1) {
            room.player1Character = character;
            room.player1GameState = room.gameState.players.get(playerId);
        } else if (isPlayer2) {
            room.player2Character = character;
            room.player2GameState = room.gameState.players.get(playerId);
        }

        io.to(room.roomName).emit("characterSelected", {
            isPlayer1,
            character,
            username,
        });
        room.broadcastRoomState();

        if (room.player1Character && room.player2Character) {
            room.startGame();
            io.to(room.roomName).emit("initServerPlayers", {
                players: [room.player1GameState, room.player2GameState],
            });

            io.to(room.roomName).emit("playerJoined", player);
        }
    });

    socket.on("verifyRoom", (roomName) => {
        roomName = encodeURIComponent(roomName);
        const inRoom = socket.rooms.has(roomName);
        const room = GameRoom.gameRooms[roomName];

        const inRoomAs = room?.inRoomAs(socket);
        if (!inRoomAs || inRoomAs == "unknown") {
            if (inRoom) {
                socket.leave(roomName);
            }
            socket.emit("error", { message: "You are not in this room" });
            socket.emit("roomVerified", inRoomAs);
        } else if (inRoomAs !== "unknown" && inRoom) {
            socket.emit("roomVerified", inRoomAs);
        }
        console.log(`verifyRoom: Socket ${socket.id} is in room ${roomName} as ${inRoomAs}`);
    });

    socket.on("joinRoom", ({ roomName }) => {
        roomName = encodeURIComponent(roomName);
        console.log("joinRoom", socket.id, roomName);
        const room = GameRoom.gameRooms[roomName];
        if (!room) {
            socket.emit("error", { message: "Room not found" });
            return;
        }
        room.addSocketToRoom(socket);
        socket.broadcast.emit(
            "roomsList",
            Object.values(GameRoom.gameRooms).map((gr) => gr.toDto())
        );
    });

    socket.on("leaveRoom", (roomName) => {
        console.log("leaveRoom", socket.id, roomName);
        const room = GameRoom.gameRooms[roomName];
        if (!room) {
            socket.emit("error", { message: "Room not found" });
            return;
        }
        room.removeSocketFromRoom(socket);
        room.gameState.players.delete(socket.id);

        socket.broadcast.emit(
            "roomsList",
            Object.values(GameRoom.gameRooms).map((gr) => gr.toDto())
        );
    });

    socket.on("createRoom", ({ roomName }) => {
        console.log("createRoom", roomName);
        roomName = encodeURIComponent(roomName);

        if (GameRoom.gameRooms[roomName]) {
            socket.emit("error", { message: "Room name already exists" });
            return;
        }
        const newRoom = new GameRoom({ io, socketNames, ownerId: socket.id, roomName });
        GameRoom.gameRooms[roomName] = newRoom;
        newRoom.addSocketToRoom(socket);
        socket.broadcast.emit(
            "roomsList",
            Object.values(GameRoom.gameRooms).map((gr) => gr.toDto())
        );
    });

    socket.on("getRooms", () => {
        socket.emit(
            "roomsList",
            Object.values(GameRoom.gameRooms).map((gr) => gr.toDto())
        );
    });
    socket.emit(
        "roomsList",
        Object.values(GameRoom.gameRooms).map((gr) => gr.toDto())
    );
    socket.on("ping", (data) => {
        socket.emit("pong", {
            clientTimestamp: data.clientTimestamp,
            serverTimestamp: Date.now(),
        });
    });

    socket.on("playerInputBatch", (data) => addInputBatchToPlayer(data, socket));

    socket.on("requestRoomPlayers", () => {
        const room = GameRoom.socketIdToRoom[socket.id];
        if (!room) {
            socket.emit("error", { message: "You are not in a room" });
            return;
        }
        room.broadcastRoomState(socket);
    });

    socket.on("disconnect", () => {
        const playerId = socket.id;
        console.log("User disconnected", playerId);
        const room = GameRoom.socketIdToRoom[playerId];
        if (room) {
            room.removeSocketFromRoom(socket);
            room.gameState.players.delete(playerId);
        }
        delete GameRoom.socketIdToRoom[socket.id];
        delete socketNames[socket.id];
        io.emit("playerLeft", playerId);
    });
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
