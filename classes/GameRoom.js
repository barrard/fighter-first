import GameLoopService from "../services/GameLoopService.js";

export default class GameRoom {
    static socketIdToRoom = {};
    static gameRooms = {};

    constructor({ io, socketNames, ownerId, roomName }) {
        this.io = io;
        this.gameState = { players: new Map() };
        this.socketNames = socketNames;
        this.roomName = roomName;
        this.ownerId = ownerId;
        this.spectators = {};
        this.player1Id = null;
        this.player2Id = null;
        this.player1Character = null;
        this.player2Character = null;
        this.players = 0;
        this.gameLoopService = new GameLoopService(this.io, this.roomName, this.gameState);
    }

    startGame() {
        this.gameLoopService.start();
    }

    stopGame() {
        this.gameLoopService.stop();
    }

    toDto() {
        return {
            roomName: decodeURIComponent(this.roomName),
            ownerId: this.ownerId,
            players: this.players,
            player1: this.player1Id,
            player1Character: this.player1Character,
            player2: this.player2Id,
            player2Character: this.player2Character,
            spectators: Object.keys(this.spectators),
        };
    }

    inRoomAs(socket) {
        if (this.player1Id === socket?.id) return "player1";
        if (this.player2Id === socket?.id) return "player2";
        else if (this.spectators[socket?.id]) return "spectator";
        return "unknown";
    }
    removeSocketFromRoom(socket) {
        socket.leave(this.roomName);
        GameRoom.socketIdToRoom[socket.id] = null;

        if (!GameRoom.gameRooms[this.roomName]) {
            return;
        }

        const asPlayerType = this.inRoomAs(socket);

        if (asPlayerType === "player1" || asPlayerType === "player2") {
            this.stopGame();
            this.io.to(this.roomName).emit("error", { message: "Game ended: Opponent left." });
            delete GameRoom.gameRooms[this.roomName];
            return;
        } else if (asPlayerType === "spectator") {
            delete this.spectators[socket.id];
            return;
        }
    }

    addSocketToRoom(socket) {
        const existingRoom = GameRoom.socketIdToRoom[socket.id];
        if (existingRoom) {
            const asPlayerType = existingRoom.inRoomAs(socket);
            return socket.emit("joinGameRoom", {
                roomName: this.roomName,
                asPlayerType,
                player1: this.player1Id,
                player2: this.player2Id,
                spectators: Object.keys(this.spectators),
            });
        }

        let asPlayerType = "";
        if (!this.player1Id) {
            this.player1Id = socket.id;
            asPlayerType = "player1";
            this.players += 1;
        } else if (!this.player2Id) {
            this.player2Id = socket.id;
            asPlayerType = "player2";
            this.players += 1;
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
            player1: this.player1Id,
            player2: this.player2Id,
            spectators: Object.keys(this.spectators),
        });

        // characterSelected
        if (this.player1Character) {
            this.io.to(this.roomName).emit("characterSelected", {
                isPlayer1: true,
                character: this.player1Character,
                username: this.socketNames[this.player1Id],
            });
        }
        if (this.player2Character) {
            this.io.to(this.roomName).emit("characterSelected", {
                isPlayer1: false,
                character: this.player2Character,
                username: this.socketNames[this.player2Id],
            });
        }
    }
}
