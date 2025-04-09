import CONSTS from "/js/contants.js";
// import CONSTS from "http://localhost:3000/js/contants.js";
import { DrawPlayer, DrawPunch, DrawKick, DrawFaceDirection, DrawYou, DrawFloor, DrawInitialScene } from "/js/Draw.js";
// import { DrawPlayer, DrawPunch, DrawKick, DrawFaceDirection, DrawYou, DrawFloor, DrawInitialScene  } from "http://localhost:3000/js/Draw.js";

class GameLoop {
    constructor(myCanvas, socket, inputBatcher) {
        this.socket = socket;
        this.localInputs = inputBatcher;
        this.myCanvas = myCanvas;
        this.canvas = myCanvas.canvas;
        this.ctx = this.canvas.getContext("2d");

        this.allPlayers = new Map();

        this.isJumping = false;
        this.isKicking = false;
        this.isPunching = false;
        this.horizontalVelocity = 0;
        this.frame = 0;
        this.prevFrame = 0;
        this.prevFrameSent = 0;
        this.inputsOnDeck = [];
        this.localX_Adjustment = 0;
        this.totalXBeenAdjusted = 0;
        setInterval(() => {
            const diff = this.frame - this.prevFrame;
            console.log({ prevFrame: this.prevFrame, frame: this.frame, diff });
            this.prevFrame = this.frame;
        }, 1000);

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
            SERVER_TICK_RATE,
        } = CONSTS(this.canvas);

        this.MOVEMENT_SPEED = MOVEMENT_SPEED;
        this.JUMP_VELOCITY = JUMP_VELOCITY;
        this.GRAVITY = GRAVITY;
        this.SERVER_TICK_RATE = SERVER_TICK_RATE;
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
        this.localInputs.gameLoop = this;
        // Initialize game state
        this.socket.on("init", (serverData) => {
            console.log("Received init serverData:", serverData);
            if (this.localPlayerId != serverData.playerId) {
                this.localPlayerId = serverData.playerId;
            }

            this.localInputs.init();

            // Add all existing players
            serverData.players.forEach((serverPlayer) => {
                // Set initial y position on the floor
                serverPlayer.y = this.FLOOR_Y - this.PLAYER_HEIGHT;
                // Set default facing direction if not provided
                serverPlayer.facing = serverPlayer.facing || "right";
                // Initialize interpolation targets
                serverPlayer.targetX = serverPlayer.x;
                // serverPlayer.targetHeight = serverPlayer.height || 0;
                this.allPlayers.set(serverPlayer.id, serverPlayer);
            });

            console.log("this.Players initialized:", this.allPlayers.size);
            this.gameLoop.bind(this)();
        });

        // Handle new player joining
        this.socket.on("playerJoined", (serverPlayer) => {
            console.log("New serverPlayer joined:", serverPlayer.id);
            // Set initial y position on the floor
            serverPlayer.y = this.FLOOR_Y - this.PLAYER_HEIGHT;
            // Set default facing direction if not provided
            serverPlayer.facing = serverPlayer.facing || "right";
            // Initialize interpolation targets
            serverPlayer.targetX = serverPlayer.x;
            // serverPlayer.targetHeight = serverPlayer.height || 0;
            this.allPlayers.set(serverPlayer.id, serverPlayer);
        });

        this.socket.on("playerKicked", (id) => {
            const player = this.allPlayers.get(id);
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
            this.allPlayers.delete(id);
        });

        // Modify the gameState handler for other players
        this.socket.on("gameState", (data) => {
            // const serverTime = Date.now();
            data.players.forEach((serverPlayer) => {
                if (serverPlayer.id === this.localPlayerId) {
                    // Local player - handle with prediction/reconciliation
                    this.handleServerUpdateLocalPlayer(serverPlayer);
                } else {
                    // Other players - interpolate movement
                    let otherPlayer = this.allPlayers.get(serverPlayer.id);
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
                            // targetHeight: serverPlayer.height || 0,
                            isPunching: false,
                            isKicking: false,
                        };
                        this.allPlayers.set(serverPlayer.id, otherPlayer);
                    } else {
                        // Existing player - update targets for interpolation
                        otherPlayer.targetX = serverPlayer.x;
                        // otherPlayer.targetHeight = serverPlayer.height || 0;

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
            this.localPlayerId = this.socket.id;

            console.log("Connected to server with ID:", this.socket.id);
            this.myCanvas.status.textContent = "Connected! Use arrow keys to move.";
        });

        // Handle disconnection
        this.socket.on("disconnect", () => {
            console.log("Disconnected from server");
            this.myCanvas.status.textContent = "Disconnected from server. Trying to reconnect...";
        });
    }

    // Modify handleServerUpdateLocalPlayer to better handle time differences
    handleServerUpdateLocalPlayer(serverPlayerLocal) {
        if (!this.localPlayerId) return;
        const localFuturePlayer = this.allPlayers.get(this.localPlayerId);
        if (!localFuturePlayer) return;
        const sentInputWithTicks = this.localInputs.sentInputWithTicks;

        if (sentInputWithTicks.length > 0 && serverPlayerLocal.currentTick != this.localInputs.currentTick) {
            // Preserve visual state
            const visualState = {
                color: localFuturePlayer.color,
                id: localFuturePlayer.id,
                isPunching: localFuturePlayer.isPunching,
                isKicking: localFuturePlayer.isKicking,
            };
            const futureClientPosition = {
                x: localFuturePlayer.x,
                y: localFuturePlayer.y,
                height: localFuturePlayer.height,
                currentTick: localFuturePlayer.currentTick,
                horizontalVelocity: localFuturePlayer.horizontalVelocity,
                verticalVelocity: localFuturePlayer.verticalVelocity,
            };

            if (localFuturePlayer.isJumping) {
                console.log({
                    "FROM SERVER.currentTick": serverPlayerLocal.currentTick,
                    "serPlyr.x": serverPlayerLocal.x,
                    // "serPlyr.y": serverPlayerLocal.y,
                    "serPlyr.height": serverPlayerLocal.height,
                    "serPlyr.verticalVelocity": serverPlayerLocal.verticalVelocity,
                    "serPlyr.horizontalVelocity": serverPlayerLocal.horizontalVelocity,
                });

                console.log({
                    "LOCALFUTUREPLAYER.currentTick": futureClientPosition.currentTick,
                    "futClitPos.x": futureClientPosition.x,
                    "futClitPos.y": futureClientPosition.y,
                    "futClitPos.height": futureClientPosition.height,
                    "futClitPos.verticalVelocity": futureClientPosition.verticalVelocity,
                    "futClitPos.horizontalVelocity": futureClientPosition.horizontalVelocity,
                });
            }

            // Apply server state
            localFuturePlayer.x = serverPlayerLocal.x;
            localFuturePlayer.height = serverPlayerLocal.height || 0;
            localFuturePlayer.y = this.FLOOR_Y - this.PLAYER_HEIGHT - localFuturePlayer.height;
            // isJumping = serverPlayerLocal.isJumping !== undefined ? serverPlayerLocal.isJumping : serverPlayerLocal.height > 0;
            localFuturePlayer.horizontalVelocity = serverPlayerLocal.horizontalVelocity || 0;
            localFuturePlayer.verticalVelocity = serverPlayerLocal.verticalVelocity || 0;
            localFuturePlayer.isJumping = serverPlayerLocal.isJumping || false;
            // Always update facing direction
            if (serverPlayerLocal.facing) {
                localFuturePlayer.facing = serverPlayerLocal.facing;
            }

            // Find the input data with this tick
            const matchingServerTickIndex = sentInputWithTicks.findIndex(
                (data) => data.currentTick === serverPlayerLocal.currentTick + 1
            );

            if (matchingServerTickIndex >= 0) {
                // We found the server tick in our sent inputs

                // Remove all inputs up to and including the current server tick
                // as they've been processed by the server
                const inputsToReplay = sentInputWithTicks.slice(matchingServerTickIndex);
                console.log(
                    "inputsToReplay ",
                    inputsToReplay.map((d) => d.currentTick)
                );
                // Remove processed inputs from our sent inputs array
                this.localInputs.sentInputWithTicks = inputsToReplay;

                // Replay all inputs that haven't been processed by the server yet
                let currentState = {
                    x: localFuturePlayer.x,
                    y: localFuturePlayer.y,
                    height: localFuturePlayer.height,
                    horizontalVelocity: localFuturePlayer.horizontalVelocity,
                    verticalVelocity: localFuturePlayer.verticalVelocity,
                    facing: localFuturePlayer.facing,
                    isJumping: localFuturePlayer.isJumping || localFuturePlayer.height > 0,
                };

                // const MS_PER_SERVER_TICK = 1000 / this.SERVER_TICK_RATE; // 50ms per tick

                // Replay each input with proper time scaling
                for (const input of inputsToReplay) {
                    for (let i = 0; i < input.keysPressed.length; i++) {
                        // this is assuming always and forever
                        // that the server tick rate is 50ms
                        // and 3 ticks exist
                        currentState = this.simulatePlayerMovementFrame(currentState, input.keysPressed[i]);
                    }
                }

                console.log(
                    "inputsOnDeck ",
                    this.inputsOnDeck.map((d) => d)
                );

                for (let x = 0; x < this.inputsOnDeck.length; x++) {
                    currentState = this.simulatePlayerMovementFrame(currentState, this.inputsOnDeck[x]);
                }

                // Update localFuturePlayer with predicted state
                localFuturePlayer.x = currentState.x;
                localFuturePlayer.y = currentState.y;
                localFuturePlayer.height = currentState.height;
                localFuturePlayer.facing = currentState.facing;
                localFuturePlayer.horizontalVelocity = currentState.horizontalVelocity;
                localFuturePlayer.verticalVelocity = currentState.verticalVelocity;
                console.log({
                    "locAfRecil.currentTick": localFuturePlayer.currentTick,
                    "locAfRecil.x": localFuturePlayer.x,
                    "locAfRecil.y": localFuturePlayer.y,
                    "locAfRecil.height": localFuturePlayer.height,
                    "locAfRecil.verticalVelocity": localFuturePlayer.verticalVelocity,
                    "locAfRecil.horizontalVelocity": localFuturePlayer.horizontalVelocity,
                    "locAfRecil.isJumping": localFuturePlayer.isJumping,
                });

                this.localX_Adjustment = futureClientPosition.x - localFuturePlayer.x;
                if (this.localX_Adjustment > 20) {
                    debugger;
                }
                this.totalXBeenAdjusted = 0;
                // Other state properties as needed
                // Restore visual state
                Object.assign(localFuturePlayer, visualState);
            } else {
                console.error(
                    "~! matchingServerTickIndex < 0 for serverPlayerLocal.currentTick " + serverPlayerLocal.currentTick
                );
                // Server sent us a tick we don't have record of
                // This could happen if there was significant packet loss
                // In this case, just accept the server state and clear inputs
                // this.localInputs.sentInputWithTicks = [];
                // console.warn("Server tick not found in client history, resetting prediction");
            }
        }
    }

    // You'll need to implement this function to simulate one tick of player movement
    simulatePlayerMovementFrame(playerState, keysPressed) {
        // This should exactly match the movement logic on the server
        const newState = { ...playerState };

        // Handle jumping
        if (keysPressed.ArrowUp && !playerState.isJumping) {
            newState.verticalVelocity = this.JUMP_VELOCITY; // Replace with your jump velocity
            newState.isJumping = true;
        }
        // if (!keysPressed.ArrowRight) {
        //     console.log("Why not ArrowRight?", keysPressed);
        // }

        // Handle horizontal movement
        if (keysPressed.ArrowLeft) {
            newState.horizontalVelocity = -this.MOVEMENT_SPEED; // Replace with your movement speed
            // newState.facing = "left";
        } else if (keysPressed.ArrowRight) {
            newState.horizontalVelocity = this.MOVEMENT_SPEED; // Replace with your movement speed
            // newState.facing = "right";
        } else if (!playerState.isJumping) {
            // Add some deceleration if desired
            newState.horizontalVelocity = 0; // Friction factor
        }

        // Update position with time-scaled movement
        newState.x += newState.horizontalVelocity;
        newState.height -= newState.verticalVelocity;

        // Handle landing
        if (newState.height <= 0) {
            newState.height = 0;
            newState.verticalVelocity = 0;
            newState.isJumping = false;
            // Apply gravity
        } else if (newState.isJumping) {
            newState.verticalVelocity += this.GRAVITY; // Replace with your gravity value
        }

        // Update y position based on height
        newState.y = this.FLOOR_Y - this.PLAYER_HEIGHT - newState.height;
        // ;
        return newState;
    }
    // Updated updateLocalPlayerGameLoop with smoother local prediction
    updateLocalPlayerGameLoop() {
        if (!this.localPlayerId) return;
        let player = this.allPlayers.get(this.localPlayerId);
        if (!player) return;

        // Check if player is on the ground or in the air
        const onGround = !this.isJumping;

        console.log({
            "pcGL.currentTick Start": player.currentTick,
            "pcGL.currentFrame Start": player.currentFrame,
            x: player.x,
            y: player.y,
            height: player.height,
            horizontalVelocity: player.horizontalVelocity,
            verticalVelocity: player.verticalVelocity,
            facing: player.facing,
            isJumping: player.isJumping,
        });
        if (player.currentTick !== this.localInputs.currentTick) {
            player.currentTick = this.localInputs.currentTick;
        }
        // if (!this.localInputs.keysPressed.ArrowRight) {
        //     console.log("Right should be held", this.localInputs);
        // }
        this.inputsOnDeck.push({ ...this.localInputs.keysPressed, frame: this.frame });
        // Apply horizontal movement with time scaling
        if (onGround) {
            // Direct ground control
            if (this.localInputs.keysPressed.ArrowLeft) {
                this.horizontalVelocity = -this.MOVEMENT_SPEED;
            } else if (this.localInputs.keysPressed.ArrowRight) {
                this.horizontalVelocity = this.MOVEMENT_SPEED;
            } else if (!this.isJumping) {
                // Force stop if no keys are pressed or if it's been too long since input
                // if (currentTime - lastInputTime > inputCooldown) {
                this.horizontalVelocity = 0;
                // }
            }
        }
        if (this.localInputs.isJumping && !this.isJumping) {
            player.verticalVelocity = this.JUMP_VELOCITY;
            this.isJumping = true;
            this.localInputs.isJumping = false;
        }

        // Apply horizontal velocity with smoothing
        player.x += this.horizontalVelocity;
        // Constrain player within boundaries //NEEDS TODO BETTER
        player.x = Math.max(0, Math.min(this.canvas.width - this.PLAYER_WIDTH, player.x));
        const adj = this.localX_Adjustment != 0 ? Math.floor(this.localX_Adjustment / 3) : this.localX_Adjustment;
        this.totalXBeenAdjusted += adj;
        if (Math.abs(this.totalXBeenAdjusted) < Math.abs(this.localX_Adjustment)) {
            player.x += adj;
        }

        // console.log({
        //     "Math.floor(this.localX_Adjustment / 3)": Math.floor(this.localX_Adjustment / 3),
        //     playerX: player.x,
        // });

        // Apply gravity and jumping physics with time scaling
        if (this.isJumping) {
            player.height -= player.verticalVelocity;
            player.verticalVelocity += this.GRAVITY;

            // Check if player has landed on the floor
            if (player.height <= 0) {
                player.height = 0;
                player.verticalVelocity = 0;
                this.isJumping = false;
                this.localInputs.isJumping = false;
            }
            player.y = this.FLOOR_Y - this.PLAYER_HEIGHT - player.height;
        }
        console.log({
            "pcGL.currentTick end": player.currentTick,
            "pcGL.currentFrame end": player.currentFrame,

            x: player.x,
            y: player.y,
            height: player.height,
            horizontalVelocity: player.horizontalVelocity,
            verticalVelocity: player.verticalVelocity,
            facing: player.facing,
            isJumping: player.isJumping,
        });
    }

    gameLoop() {
        // Debug current players
        // const localPlayer = this.allPlayers.get(this.localPlayerId);
        // const remotePlayers = Array.from(this.allPlayers.values()).filter((p) => p.id !== this.localPlayerId);

        console.log({ frame: this.frame });
        if (this.frame - this.prevFrameSent == 3) {
            this.prevFrameSent = this.frame;
            const p = this.allPlayers.get(this.localPlayerId);
            console.log({
                isMoving: p.isMoving,
                ArrowRight: this.localInputs.keysPressed["ArrowRight"],
                ArrowLeft: this.localInputs.keysPressed["ArrowLeft"],
                ArrowUp: this.localInputs.keysPressed["ArrowUp"],
            });
            this.localInputs.sendBatch(); //.bind(this.localInputs);
            this.localInputs.updateTick(); //.bind(this.localInputs);
        }
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Apply interpolation to other players ONLY ONCE
        this.allPlayers.forEach((localPlayer) => {
            // Skip local localPlayer
            localPlayer.currentFrame = this.frame;
            if (localPlayer.id !== this.localPlayerId) {
                // Only interpolate remote players
                if (localPlayer.targetX !== undefined) {
                    localPlayer.x = localPlayer.targetX;
                }
                // if (localPlayer.targetHeight !== undefined) {
                //     localPlayer.height = localPlayer.targetHeight;
                //     localPlayer.y = this.FLOOR_Y - this.PLAYER_HEIGHT - localPlayer.height;
                // }
            }
        });
        // Update local player position for responsive feel
        this.updateLocalPlayerGameLoop();

        // Draw floor
        DrawFloor(this.ctx, this.canvas);

        // Draw all players
        this.allPlayers.forEach((player) => {
            // Draw player rectangle
            DrawPlayer(this.ctx, player);

            // Draw punching animation (arm extension)
            if (player.isPunching || (player.id === this.localPlayerId && this.isPunching)) {
                DrawPunch(this.ctx, player);
            }

            // Draw kicking animation (leg extension)
            if (player.isKicking || (player.id === this.localPlayerId && this.isKicking)) {
                DrawKick(this.ctx, player);
            }
            // Draw direction indicator (triangle pointing in the facing direction)
            DrawFaceDirection(this.ctx, player);

            // Highlight current player
            if (player.id === this.localPlayerId) {
                DrawYou(this.ctx, player);
            }
        });

        // Update player count
        this.myCanvas.status.textContent = `Connected Players: ${this.allPlayers.size}`;
        this.frame++;

        // Continue game loop
        requestAnimationFrame(this.gameLoop.bind(this));
    }
}

export default GameLoop;
