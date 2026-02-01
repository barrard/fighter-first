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
        this.readyPlayers = new Set();
        this.latencyAckCounts = new Map();
        this.latencyAckSeqs = new Map();
        this.latencyProbeTimer = null;
        this.latencyProbeSeq = 0;
        this.isCalibrationRunning = false;
        this.gameStarted = false;
    }
    broadcastRoomState(targetSocket = null) {
        const payload = {
            player1: this.player1Id
                ? {
                      id: this.player1Id,
                      username: this.socketNames[this.player1Id],
                      character: this.player1Character,
                  }
                : null,
            player2: this.player2Id
                ? {
                      id: this.player2Id,
                      username: this.socketNames[this.player2Id],
                      character: this.player2Character,
                  }
                : null,
        };

        if (targetSocket) {
            targetSocket.emit("roomPlayersUpdate", payload);
            return;
        }

        this.io.to(this.roomName).emit("roomPlayersUpdate", payload);
    }

    startGame() {
        if (this.gameStarted) return;
        this.gameStarted = true;
        this.gameLoopService.start();
        this.matchStartInfo = this.gameLoopService.getMatchStartInfo();
        console.log(
            `[MATCH START] room=${this.roomName} serverTick=${this.matchStartInfo.serverTick} matchStartTick=${this.matchStartInfo.matchStartTick} tickRate=${this.matchStartInfo.tickRate}`
        );
        this.io.to(this.roomName).emit("matchStart", this.matchStartInfo);
    }

    stopGame() {
        this.gameLoopService.stop();
        this.gameStarted = false;
        this.readyPlayers.clear();
        this.latencyAckCounts.clear();
        this.latencyAckSeqs.clear();
        this.stopCalibration();
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
            this.broadcastRoomState();
            return;
        }
        this.broadcastRoomState();
    }

    addSocketToRoom(socket) {
        const existingRoom = GameRoom.socketIdToRoom[socket.id];
        if (existingRoom) {
            if (existingRoom.roomName !== this.roomName) {
                existingRoom.removeSocketFromRoom(socket);
            } else {
                const asPlayerType = existingRoom.inRoomAs(socket);
                return socket.emit("joinGameRoom", {
                    roomName: this.roomName,
                    asPlayerType,
                    player1: this.player1Id,
                    player2: this.player2Id,
                    spectators: Object.keys(this.spectators),
                });
            }
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

        this.broadcastRoomState();

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

        // If spectator joins an ongoing game, send them the current game state
        if (asPlayerType === "spectator" && this.player1Character && this.player2Character) {
            const players = Array.from(this.gameState.players.values());
            socket.emit("initServerPlayers", { players });
        }
    }

    markPlayerReady(socketId) {
        if (socketId !== this.player1Id && socketId !== this.player2Id) return false;
        this.readyPlayers.add(socketId);
        console.log(
            `[READY] room=${this.roomName} player=${socketId.slice(0, 6)} readyCount=${this.readyPlayers.size}`
        );
        if (this.readyPlayers.has(this.player1Id) && this.readyPlayers.has(this.player2Id)) {
            this.startCalibration();
        }
        return true;
    }

    startCalibration() {
        if (this.isCalibrationRunning || this.gameStarted) return;
        this.isCalibrationRunning = true;
        this.latencyProbeSeq = 0;
        this.latencyAckCounts.clear();
        this.latencyAckSeqs.clear();
        this.stopCalibration();
        this.latencyProbeTimer = setInterval(() => {
            this.latencyProbeSeq += 1;
            const payload = { seq: this.latencyProbeSeq, serverSentAt: Date.now() };
            console.log(
                `[LATENCY PROBE] room=${this.roomName} seq=${this.latencyProbeSeq} serverSentAt=${payload.serverSentAt}`
            );
            this.io.to(this.roomName).emit("latencyProbe", payload);
            if (this.latencyProbeSeq >= 3) {
                this.stopCalibration();
            }
        }, 500);
    }

    stopCalibration() {
        if (this.latencyProbeTimer) {
            clearInterval(this.latencyProbeTimer);
            this.latencyProbeTimer = null;
        }
        this.isCalibrationRunning = false;
    }

    recordLatencyAck(socketId) {
        if (socketId !== this.player1Id && socketId !== this.player2Id) return;
        const current = this.latencyAckCounts.get(socketId) || 0;
        const next = current + 1;
        this.latencyAckCounts.set(socketId, next);
        console.log(
            `[LATENCY ACK] room=${this.roomName} player=${socketId.slice(0, 6)} count=${next}`
        );
    }

    recordLatencyAckSeq(socketId, seq) {
        if (socketId !== this.player1Id && socketId !== this.player2Id) return;
        if (!seq) return;
        if (!this.latencyAckSeqs.has(socketId)) {
            this.latencyAckSeqs.set(socketId, new Set());
        }
        const seqSet = this.latencyAckSeqs.get(socketId);
        if (seqSet.has(seq)) {
            return;
        }
        seqSet.add(seq);
        this.recordLatencyAck(socketId);
        const p1Seqs = this.latencyAckSeqs.get(this.player1Id);
        const p2Seqs = this.latencyAckSeqs.get(this.player2Id);
        if (p1Seqs?.has(3) && p2Seqs?.has(3)) {
            this.startGame();
        }
    }
}
