import GameLoopService from "../services/GameLoopService.js";

export default class GameRoom {
    static socketIdToRoom = {};
    static gameRooms = {};

    constructor({ io, socketNames, ownerId, roomName, isTrainingRoom = false }) {
        this.io = io;
        this.gameState = { players: new Map() };
        this.socketNames = socketNames;
        this.roomName = roomName;
        this.ownerId = ownerId;
        this.isTrainingRoom = isTrainingRoom;
        this.spectators = {};
        this.player1Id = null;
        this.player2Id = null;
        this.player1Character = null;
        this.player2Character = null;
        this.player1Stats = null;
        this.player2Stats = null;
        this.players = 0;
        this.gameLoopService = new GameLoopService(this.io, this.roomName, this.gameState);
        this.readyPlayers = new Set();
        this.latencyAckCounts = new Map();
        this.latencyAckSeqs = new Map();
        this.latencyProbeTimer = null;
        this.latencyProbeSeq = 0;
        this.isCalibrationRunning = false;
        this.gameStarted = false;
        this.roundNumber = 0;
        this.player1Wins = 0;
        this.player2Wins = 0;
        this.roundResetTimer = null;
        this.roundDurationSeconds = 99;
        this.bestOf = 3;
        this.spawnPadding = 100;
        this.arenaWidth = 1024;
        this.roundPrepared = false;
        this.matchOver = false;
        this.rematchVotes = new Set();
        this.countdownSeconds = 3;
        this.countdownHoldMs = 800;
        this.countdownTimer = null;
        this.isCountdownRunning = false;
        this.gameLoopService.roundDurationSeconds = this.roundDurationSeconds;
        this.gameLoopService.onRoundEnd = (payload) => this.handleRoundEnd(payload);
        this.gameLoopService.onRoundTimer = (remainingSeconds) => {
            this.io.to(this.roomName).emit("roundTimer", {
                remainingSeconds,
                round: this.roundNumber,
            });
        };
    }
    broadcastRoomState(targetSocket = null) {
        const payload = {
            player1: this.player1Id
                ? {
                      id: this.player1Id,
                      username: this.socketNames[this.player1Id],
                      character: this.player1Character,
                      stats: this.player1Stats,
                  }
                : null,
            player2: this.player2Id
                ? {
                      id: this.player2Id,
                      username: this.socketNames[this.player2Id],
                      character: this.player2Character,
                      stats: this.player2Stats,
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
        this.startRound();
    }

    stopGame() {
        this.gameLoopService.stop();
        this.gameStarted = false;
        this.readyPlayers.clear();
        this.latencyAckCounts.clear();
        this.latencyAckSeqs.clear();
        if (this.roundResetTimer) {
            clearTimeout(this.roundResetTimer);
            this.roundResetTimer = null;
        }
        this.roundPrepared = false;
        this.matchOver = false;
        this.rematchVotes.clear();
        this.stopCountdown();
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

        if (asPlayerType === "player1") {
            if (this.isTrainingRoom) {
                this.deleteRoom();
            } else {
                this.stopGame();
                this.io.to(this.roomName).emit("error", { message: "Game ended: Opponent left." });
                this.deleteRoom();
            }
            return;
        } else if (asPlayerType === "player2") {
            this.stopGame();
            this.io.to(this.roomName).emit("error", { message: "Game ended: Opponent left." });
            this.deleteRoom();
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
        } else if (!this.player2Id && !this.isTrainingRoom) {
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
        if (this.matchOver) return false;
        if (this.gameStarted || this.isCalibrationRunning) {
            return true;
        }
        if (this.readyPlayers.has(socketId)) {
            return true;
        }
        this.readyPlayers.add(socketId);
        console.log(
            `[READY] room=${this.roomName} player=${socketId.slice(0, 6)} readyCount=${this.readyPlayers.size}`
        );
        if (
            (this.readyPlayers.has(this.player1Id) && this.readyPlayers.has(this.player2Id)) ||
            (this.isTrainingRoom && this.readyPlayers.has(this.player1Id))
        ) {
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

    startCountdown() {
        if (this.isCountdownRunning || this.gameStarted) return;
        this.isCountdownRunning = true;
        this.resetPlayersForRound();
        this.roundPrepared = true;
        const players = Array.from(this.gameState.players.values());
        this.io.to(this.roomName).emit("initServerPlayers", { players });
        const payload = {
            seconds: this.countdownSeconds,
            holdMs: this.countdownHoldMs,
            tickMs: 1000,
            startAt: Date.now(),
        };
        this.io.to(this.roomName).emit("startCountdown", payload);
        const totalMs = this.countdownSeconds * payload.tickMs + this.countdownHoldMs;
        this.countdownTimer = setTimeout(() => {
            this.isCountdownRunning = false;
            this.countdownTimer = null;
            this.startGame();
        }, totalMs);
    }

    stopCountdown() {
        if (this.countdownTimer) {
            clearTimeout(this.countdownTimer);
            this.countdownTimer = null;
        }
        this.isCountdownRunning = false;
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
        if (
            (p1Seqs?.has(3) && p2Seqs?.has(3)) ||
            (this.isTrainingRoom && p1Seqs?.has(3))
        ) {
            this.startCountdown();
        }
    }

    startRound() {
        this.roundNumber += 1;
        if (!this.roundPrepared) {
            this.resetPlayersForRound();
        }
        this.gameLoopService.startRound();
        console.log(
            `[ROUND START] room=${this.roomName} round=${this.roundNumber} p1Wins=${this.player1Wins} p2Wins=${this.player2Wins}`
        );
        this.io.to(this.roomName).emit("roundStart", {
            round: this.roundNumber,
            durationSeconds: this.roundDurationSeconds,
            scores: {
                player1Wins: this.player1Wins,
                player2Wins: this.player2Wins,
            },
        });
        this.roundPrepared = false;
    }

    resetPlayersForRound() {
        for (const player of this.gameState.players.values()) {
            player.health = player.maxHealth ?? player.health ?? 100;
            player.hitStun = 0;
            player.knockbackVelocity = 0;
            player.attackState = null;
            player.isPunching = false;
            player.isKicking = false;
            player.currentAttackType = 0;
            player.isJumping = false;
            player.verticalVelocity = 0;
            player.horizontalVelocity = 0;
            player.movingDirection = null;
            player.inputBuffer = {};
            player.lastProcessedTick = 0;
            player.lastInput = null;
            player.height = 0;
            player.facing = player.id === this.player1Id ? "right" : "left";
            const width = player.characterWidth;
            if (player.id === this.player1Id) {
                player.x = this.spawnPadding;
            } else if (player.id === this.player2Id) {
                player.x = Math.max(0, this.arenaWidth - width - this.spawnPadding);
            }
        }
        this.roundPrepared = true;
    }

    handleRoundEnd({ reason, players, remainingSeconds }) {
        console.log(
            `[ROUND END HANDLER] room=${this.roomName} round=${this.roundNumber} reason=${reason} remaining=${remainingSeconds}`
        );
        const playerHealth = new Map(players.map((player) => [player.id, player.health]));
        const p1Health = playerHealth.get(this.player1Id) ?? 0;
        const p2Health = playerHealth.get(this.player2Id) ?? 0;
        let winnerId = null;
        if (!this.isTrainingRoom) {
            if (reason === "health") {
                if (p1Health > p2Health) winnerId = this.player1Id;
                if (p2Health > p1Health) winnerId = this.player2Id;
            } else if (reason === "timer") {
                if (p1Health > p2Health) winnerId = this.player1Id;
                if (p2Health > p1Health) winnerId = this.player2Id;
            }
        }
        const outcome = winnerId ? "win" : "draw";

        if (winnerId === this.player1Id) this.player1Wins += 1;
        if (winnerId === this.player2Id) this.player2Wins += 1;

        // Stop loop between rounds and require a new ready/calibration sequence
        this.gameLoopService.stop();
        this.gameStarted = false;
        this.readyPlayers.clear();
        this.latencyAckCounts.clear();
        this.latencyAckSeqs.clear();
        this.stopCalibration();
        this.stopCountdown();

        const winTarget = Math.ceil(this.bestOf / 2);
        const isMatchOver = this.player1Wins >= winTarget || this.player2Wins >= winTarget;
        this.io.to(this.roomName).emit("roundEnd", {
            round: this.roundNumber,
            reason,
            winnerId,
            outcome,
            remainingSeconds,
            players,
            scores: {
                player1Wins: this.player1Wins,
                player2Wins: this.player2Wins,
            },
            matchOver: isMatchOver,
        });
        console.log(
            `[ROUND END EMIT] room=${this.roomName} round=${this.roundNumber} winner=${winnerId ?? "draw"}`
        );

        if (this.player1Wins >= winTarget || this.player2Wins >= winTarget) {
            const matchWinnerId = this.player1Wins >= winTarget ? this.player1Id : this.player2Id;
            this.matchOver = true;
            this.rematchVotes.clear();
            this.io.to(this.roomName).emit("matchEnd", {
                winnerId: matchWinnerId,
                scores: {
                    player1Wins: this.player1Wins,
                    player2Wins: this.player2Wins,
                },
            });
            return;
        }

        // Wait for clients to re-ready; round will start after calibration + matchStart
    }

    resetMatchForRematch() {
        this.gameLoopService.stop();
        this.gameStarted = false;
        this.roundPrepared = false;
        this.readyPlayers.clear();
        this.latencyAckCounts.clear();
        this.latencyAckSeqs.clear();
        this.stopCountdown();
        this.stopCalibration();
        this.roundNumber = 0;
        this.player1Wins = 0;
        this.player2Wins = 0;
        this.matchOver = false;
    }

    registerRematchVote(socketId) {
        if (!this.matchOver) return { started: false, count: this.rematchVotes.size };
        if (socketId !== this.player1Id && socketId !== this.player2Id) {
            return { started: false, count: this.rematchVotes.size };
        }
        this.rematchVotes.add(socketId);
        const count = this.rematchVotes.size;
        if (this.rematchVotes.has(this.player1Id) && this.rematchVotes.has(this.player2Id)) {
            this.rematchVotes.clear();
            this.resetMatchForRematch();
            this.startCalibration();
            return { started: true, count: 2 };
        }
        return { started: false, count };
    }

    deleteRoom() {
        console.log(`[DELETE ROOM] room=${this.roomName}`);
        this.stopGame();
        this.io.to(this.roomName).emit("roomDeleted", { roomName: this.roomName });
        for (const playerSocketId of this.gameState.players.keys()) {
            delete GameRoom.socketIdToRoom[playerSocketId];
        }
        this.gameState.players.clear();
        this.readyPlayers.clear();
        this.latencyAckCounts.clear();
        this.latencyAckSeqs.clear();
        this.rematchVotes.clear();
        delete GameRoom.gameRooms[this.roomName];
        this.io.emit(
            "roomsList",
            Object.values(GameRoom.gameRooms).map((gr) => gr.toDto())
        );
    }
}
