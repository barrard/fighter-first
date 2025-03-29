import CONSTS from "http://localhost:3000/js/contants.js";
import {
    DrawPlayer,
    DrawPunch,
    DrawKick,
    DrawFaceDirection,
    DrawYou,
    DrawFloor,
    DrawInitialScene,
} from "http://localhost:3000/js/Draw.js";
class GameLoop {
    constructor(myCanvas, socket, inputBatcher) {
        this.socket = socket;
        this.inputBatcher = inputBatcher;
        this.myCanvas = myCanvas;
        this.canvas = myCanvas.canvas;
        this.ctx = this.canvas.getContext("2d");

        this.players = new Map();

        this.isJumping = false;
        this.isKicking = false;
        this.isPunching = false;
        this.horizontalVelocity = 0;

        const {
            PREDICTION_BUFFER_MS,
            inputCooldown,
            // INTERPOLATION_AMOUNT,
            INTERPOLATION_DELAY,
            PLAYER_WIDTH,
            PLAYER_HEIGHT,
            MOVEMENT_SPEED,
            // FLOOR_HEIGHT,
            JUMP_VELOCITY,
            GRAVITY,
            MAX_HORIZONTAL_VELOCITY,
            AIR_RESISTANCE,
            GROUND_FRICTION,
            PUNCH_DURATION,
            KICK_DURATION,
            ARM_WIDTH,
            ARM_HEIGHT,
            ARM_Y_OFFSET,
            LEG_WIDTH,
            LEG_HEIGHT,
            FLOOR_Y,
            LEG_Y_OFFSET,
        } = CONSTS(this.canvas);

        this.MOVEMENT_SPEED = MOVEMENT_SPEED;
        this.JUMP_VELOCITY = JUMP_VELOCITY;
        this.GRAVITY = GRAVITY;
        this.MAX_HORIZONTAL_VELOCITY = MAX_HORIZONTAL_VELOCITY;
        this.AIR_RESISTANCE = AIR_RESISTANCE;
        this.GROUND_FRICTION = GROUND_FRICTION;
        this.PUNCH_DURATION = PUNCH_DURATION;
        this.KICK_DURATION = KICK_DURATION;
        this.ARM_WIDTH = ARM_WIDTH;
        this.ARM_HEIGHT = ARM_HEIGHT;
        this.ARM_Y_OFFSET = ARM_Y_OFFSET;
        this.LEG_WIDTH = LEG_WIDTH;
        this.LEG_HEIGHT = LEG_HEIGHT;
        this.PLAYER_HEIGHT = PLAYER_HEIGHT;
        this.PLAYER_WIDTH = PLAYER_WIDTH;
        this.FLOOR_Y = FLOOR_Y;

        this.init();
    }

    init() {
        // Initialize game state
        this.socket.on("init", (data) => {
            console.log("Received init data:", data);
            if (this.playerId != data.playerId) {
                this.playerId = data.playerId;
            }

            // Add all existing players
            data.players.forEach((player) => {
                // Set initial y position on the floor
                player.y = this.FLOOR_Y - this.PLAYER_HEIGHT;
                // Set default facing direction if not provided
                player.facing = player.facing || "right";
                // Initialize interpolation targets
                player.targetX = player.x;
                player.targetHeight = player.height || 0;
                this.players.set(player.id, player);
            });

            console.log("this.Players initialized:", this.players.size);
        });

        // Handle new player joining
        this.socket.on("playerJoined", (player) => {
            console.log("New player joined:", player.id);
            // Set initial y position on the floor
            player.y = this.FLOOR_Y - this.PLAYER_HEIGHT;
            // Set default facing direction if not provided
            player.facing = player.facing || "right";
            // Initialize interpolation targets
            player.targetX = player.x;
            player.targetHeight = player.height || 0;
            this.players.set(player.id, player);
        });

        this.socket.on("playerKicked", (id) => {
            const player = players.get(id);
            if (player) {
                player.isKicking = true;
                player.kickStartTime = Date.now();

                // Reset kick after animation duration
                setTimeout(() => {
                    player.isKicking = false;
                }, KICK_DURATION);
            }
        });

        // Handle player leaving
        this.socket.on("playerLeft", (id) => {
            console.log("Player left:", id);
            players.delete(id);
        });

        // Modify the gameState handler for other players
        this.socket.on("gameState", (data) => {
            const serverTime = Date.now();

            data.players.forEach((serverPlayer) => {
                if (serverPlayer.id === this.playerId) {
                    // Local player - handle with prediction/reconciliation
                    this.handleServerUpdate(serverPlayer);
                } else {
                    // Other players - interpolate movement
                    let otherPlayer = this.players.get(serverPlayer.id);
                    if (!otherPlayer) {
                        console.log("Creating new remote player:", serverPlayer.id);
                        otherPlayer = {
                            id: serverPlayer.id,
                            x: serverPlayer.x,
                            y: this.FLOOR_Y - this.PLAYER_HEIGHT - (serverPlayer.height || 0),
                            height: serverPlayer.height || 0,
                            color: "#" + Math.floor(Math.random() * 16777215).toString(16),
                            facing: serverPlayer.facing || "right",
                            targetX: serverPlayer.x,
                            targetHeight: serverPlayer.height || 0,
                            isPunching: false,
                            isKicking: false,
                        };
                        this.players.set(serverPlayer.id, otherPlayer);
                    } else {
                        // Existing player - update targets for interpolation
                        otherPlayer.targetX = serverPlayer.x;
                        otherPlayer.targetHeight = serverPlayer.height || 0;

                        // Preserve visual state
                        const visualState = {
                            color: otherPlayer.color,
                            isPunching: otherPlayer.isPunching,
                            isKicking: otherPlayer.isKicking,
                        };

                        // Update other properties that don't need interpolation
                        otherPlayer.facing = serverPlayer.facing;

                        // Restore visual state
                        Object.assign(otherPlayer, visualState);
                    }
                }
            });
        });

        // Update your sendInputState function to include timestamp

        // Handle connection to the server
        this.socket.on("connect", (s) => {
            console.log(s);
            this.playerId = this.socket.id;

            console.log("Connected to server with ID:", this.socket.id);
            this.myCanvas.status.textContent = "Connected! Use arrow keys to move.";
            this.gameLoop.bind(this)();
        });

        // Handle disconnection
        this.socket.on("disconnect", () => {
            console.log("Disconnected from server");
            this.myCanvas.status.textContent = "Disconnected from server. Trying to reconnect...";
        });
    }

    // Modify handleServerUpdate to better handle time differences
    handleServerUpdate(serverPlayer) {
        if (!this.playerId) return;
        const player = this.players.get(this.playerId);
        if (!player) return;

        // Record time of this update
        const currentTime = Date.now();

        // This is the server state time in client clock
        // const serverStateClientTime = currentTime - latencyMonitor.currentLatency;

        // Allow some prediction buffer - don't correct if we're just slightly ahead
        // const effectiveServerTime = serverStateClientTime + PREDICTION_BUFFER_MS;

        // Skip too old updates (network hiccup)
        // if (lastUpdateTime > serverStateClientTime + 100) {
        //     console.log("Skipping outdated server update");
        //     return;
        // }
        debugger;
        // lastUpdateTime = currentTime;

        // Remove acknowledged inputs
        // if (serverPlayer.lastProcessedInput) {
        //     pendingInputs = pendingInputs.filter((input) => input.sequenceNumber > serverPlayer.lastProcessedInput);
        // }

        // Preserve visual state
        const visualState = {
            color: player.color,
            id: player.id,
            isPunching: player.isPunching,
            isKicking: player.isKicking,
        };

        // Calculate how much we've moved since server state
        // Only apply server correction if really needed
        const positionDiff = Math.abs(serverPlayer.x - player.x);
        // const jumpStateChanged =
        //     (serverPlayer.isJumping !== undefined ? serverPlayer.isJumping : serverPlayer.height > 0) !== isJumping;

        // If major differences, accept server state
        // if (positionDiff > 20 || jumpStateChanged) {
        // Apply server state
        player.x = serverPlayer.x;
        player.height = serverPlayer.height || 0;
        player.y = this.FLOOR_Y - this.PLAYER_HEIGHT - player.height;
        // isJumping = serverPlayer.isJumping !== undefined ? serverPlayer.isJumping : serverPlayer.height > 0;
        let horizontalVelocity = serverPlayer.horizontalVelocity || 0;
        let verticalVelocity = serverPlayer.verticalVelocity || 0;

        // Replay inputs that happened after server state
        // pendingInputs.forEach((input) => {
        //     if (input.clientTime >= effectiveServerTime) {
        //         applyInput(player, input);
        //     }
        // });
        // }

        // Always update facing direction
        if (serverPlayer.facing) {
            player.facing = serverPlayer.facing;
        }

        // Restore visual state
        Object.assign(player, visualState);
    }
    // Updated updateLocalPlayerPosition with smoother local prediction
    updateLocalPlayerPosition() {
        if (!this.playerId) return;
        let player = this.players.get(this.playerId);
        if (!player) return;
        const currentTime = Date.now();

        // Check if player is on the ground or in the air
        const onGround = !this.isJumping;

        // Apply horizontal movement with time scaling
        if (onGround) {
            // Direct ground control
            if (this.inputBatcher.keysPressed.ArrowLeft) {
                this.horizontalVelocity = -this.MOVEMENT_SPEED;
            } else if (this.inputBatcher.keysPressed.ArrowRight) {
                this.horizontalVelocity = this.MOVEMENT_SPEED;
            } else {
                // Force stop if no keys are pressed or if it's been too long since input
                // if (currentTime - lastInputTime > inputCooldown) {
                this.horizontalVelocity = 0;
                // }
            }
        } else {
            // Air movement - just air resistance
        }

        // Apply horizontal velocity with smoothing
        player.x += this.horizontalVelocity;
        // Constrain player within boundaries
        player.x = Math.max(0, Math.min(this.canvas.width - this.PLAYER_WIDTH, player.x));

        // Apply gravity and jumping physics with time scaling
        if (this.isJumping) {
            player.height -= verticalVelocity;
            verticalVelocity += GRAVITY;

            // Check if player has landed on the floor
            if (player.height <= 0) {
                player.height = 0;
                verticalVelocity = 0;
                this.isJumping = false;
            }
            player.y = this.FLOOR_Y - this.PLAYER_HEIGHT - player.height;
        }
    }

    gameLoop() {
        // Debug current players
        const localPlayer = this.players.get(this.playerId);
        const remotePlayers = Array.from(this.players.values()).filter((p) => p.id !== this.playerId);

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update local player position for responsive feel
        this.updateLocalPlayerPosition();

        // Apply interpolation to other players ONLY ONCE
        this.players.forEach((player) => {
            if (player.id !== this.playerId) {
                // Only interpolate remote players
                if (player.targetX !== undefined) {
                    player.x = player.targetX;
                }
                if (player.targetHeight !== undefined) {
                    player.height = player.targetHeight;
                    player.y = this.FLOOR_Y - this.PLAYER_HEIGHT - player.height;
                }
            }
        });
        // Draw floor
        DrawFloor(this.ctx, this.canvas);

        // Draw all players
        this.players.forEach((player) => {
            // Draw player rectangle
            DrawPlayer(this.ctx, player);

            // Draw punching animation (arm extension)
            if (player.isPunching || (player.id === this.playerId && this.isPunching)) {
                DrawPunch(this.ctx, player);
            }

            // Draw kicking animation (leg extension)
            if (player.isKicking || (player.id === this.playerId && this.isKicking)) {
                DrawKick(this.ctx, player);
            }
            // Draw direction indicator (triangle pointing in the facing direction)
            DrawFaceDirection(this.ctx, player);

            // Highlight current player
            if (player.id === this.playerId) {
                DrawYou(this.ctx, player);
            }
        });

        // Update player count
        this.myCanvas.status.textContent = `Connected Players: ${this.players.size}`;

        // Continue game loop
        requestAnimationFrame(this.gameLoop.bind(this));
    }
}

export default GameLoop;
