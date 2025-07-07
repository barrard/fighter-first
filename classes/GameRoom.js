export default class GameRoom {
    static socketIdToRoom = {};
    static gameRooms = {};

    constructor({ io, gameState, socketNames, ownerId, roomName }) {
        this.io = io;
        this.gameState = gameState;
        this.socketNames = socketNames;
        this.roomName = roomName;
        this.ownerId = ownerId;
        this.spectators = {};
        this.player1 = { id: ownerId };
        this.player2 = {};
        this.players = 0;
    }

    toDto() {
        return {
            roomName: decodeURIComponent(this.roomName),
            ownerId: this.ownerId,
            players: this.players,
            player1: this.player1.id,
            player1Character: this.player1.character,
            player2: this.player2.id,
            player2Character: this.player2.character,
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
        const game = GameRoom.gameRooms[this.roomName];
        let isPlayer1 = false;
        if (game.inRoomAs(socket) == "player1") {
            this.player1 = {};
            this.players -= 1;
            isPlayer1 = true;
        } else if (game.inRoomAs(socket) == "player2") {
            this.player2 = {};
            this.players -= 1;
            isPlayer1 = false;
        } else if (game.inRoomAs(socket) == "spectator") {
            delete this.spectators[socket.id];
            return; //don't bother running the emit
        }

        this.io.to(this.roomName).emit("characterSelected", {
            isPlayer1,
            character: {},
            username: "",
        });
    }

    addSocketToRoom(socket) {
        if (GameRoom.socketIdToRoom[socket.id]) {
            const asPlayerType = GameRoom.socketIdToRoom[socket.id].inRoomAs(socket);
            return socket.emit("joinGameRoom", {
                roomName: this.roomName,
                asPlayerType,
                player1: this.player1.gameState,
                player2: this.player2.gameState,
                spectators: Object.keys(this.spectators),
            });

            // return socket.emit("error", { message: "You are already in a room" });
        }
        const isPlayer1 = this.player1.id == socket.id;
        const isPlayer2 = this.player2.id == socket.id;
        let asPlayerType = "";
        if (!this.player1.id || isPlayer1) {
            this.player1.id = socket.id;
            asPlayerType = "player1";
            this.players += 1;
        } else if (!this.player2.id || isPlayer2) {
            this.player2.id = socket.id;
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
            player1: this.player1.id,
            player2: this.player2.id,
            spectators: Object.keys(this.spectators),
        });

        // characterSelected
        if (this.player1.character) {
            this.io.to(this.roomName).emit("characterSelected", {
                isPlayer1: true,
                character: this.player1.character,
                username: this.socketNames[this.player1],
            });
        }
        if (this.player2.character) {
            this.io.to(this.roomName).emit("characterSelected", {
                isPlayer1: false,
                character: this.player2.character,
                username: this.socketNames[this.player2],
            });
        }
    }
}
