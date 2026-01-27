import { performance } from "perf_hooks";

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
const ARENA_WIDTH = 937;
const JUMP_VELOCITY = -15;
const GRAVITY = 0.8;
const FLOOR_Y = 800; // This should match your client calculation
const FLOOR_HEIGHT = 40; // or some other value
const AIR_RESISTANCE = 0.02;
const GROUND_FRICTION = 0.2;
const ONE_SECOND = 1000;
const FPS_SERVER = 20;
const SERVER_FPS_TIME = ONE_SECOND / FPS_SERVER;

const getCharacterWidth = (player) => player?.characterWidth; //|| PLAYER_WIDTH;
const getCharacterHeight = (player) => player?.characterHeight; //|| PLAYER_HEIGHT;
const getMovementSpeed = (player) => player?.movementSpeed; //|| MOVEMENT_SPEED;
const getJumpVelocity = (player) => player?.jumpVelocity; //|| JUMP_VELOCITY;
const getPunchDuration = (player) => player?.punchDuration; //|| PUNCH_DURATION;
const getKickDuration = (player) => player?.kickDuration; //|| KICK_DURATION;

export default class GameLoopService {
    constructor(io, roomName, gameState) {
        this.io = io;
        this.roomName = roomName;
        this.gameState = gameState;
        this.serverTick = 0;
        this.lastServerTick = 0;
        this.lastTimeSent = 0;
        this.dataSent = 0;
        this.loopTimes = [];
        this.perfWindow = 60;
        this.gameLoopInterval = null;
    }

    start() {
        this.gameLoopInterval = setInterval(() => {
            this.tick();
        }, 1000 / 61); // ~60 fps
    }

    stop() {
        clearInterval(this.gameLoopInterval);
    }

    tick() {
        const startTime = performance.now();
        this.serverTick++;

        this.updatePlayerFacingDirections();

        this.gameState.players.forEach((player) => {
            this.handlePlayerInput(player);
            this.updatePlayerState(player);
        });

        const timeSent = Date.now();
        const timeDiff = timeSent - this.lastTimeSent;
        const tickDiff = this.serverTick - this.lastServerTick;

        if (tickDiff == 3) {
            this.dataSent++;
            this.lastServerTick = this.serverTick;
            this.lastTimeSent = timeSent;
            const players = Array.from(this.gameState.players.values()).map((player) => ({
                id: player.id,
                x: player.x,
                currentTick: player.currentTick,
                height: player.height,
                facing: player.facing,
                isJumping: player.isJumping,
                isKicking: player.isKicking,
                isPunching: player.isPunching,
                verticalVelocity: player.verticalVelocity,
                horizontalVelocity: player.horizontalVelocity,
                characterWidth: getCharacterWidth(player),
                characterHeight: getCharacterHeight(player),
                movementSpeed: getMovementSpeed(player),
                jumpVelocity: getJumpVelocity(player),
                punchDuration: getPunchDuration(player),
                kickDuration: getKickDuration(player),
                arenaWidth: ARENA_WIDTH,
                lastProcessedInput: player.lastInput || 0,
                serverTick: player.serverTick,
            }));
            this.io.to(this.roomName).emit("gameState", { players });
        }

        const endTime = performance.now();
        const loopDuration = endTime - startTime;
        this.loopTimes.push(loopDuration);

        if (this.loopTimes.length > this.perfWindow) {
            this.loopTimes.shift();
        }

        if (this.serverTick % this.perfWindow === 0 && this.loopTimes.length > 0) {
            const averageTime = this.loopTimes.reduce((a, b) => a + b, 0) / this.loopTimes.length;
            console.log(
                `Room: ${this.roomName} - Average loop time (last ${this.perfWindow} ticks): ${averageTime.toFixed(4)} ms`,
            );
        }
    }

    handlePlayerInput(player) {
        const nextInput = player.batchInput.shift();
        if (!nextInput) {
            player.nextInput = player.lastInput;
        } else {
            player.nextInput = nextInput;
            player.lastInput = nextInput;
        }
        if (!player.nextInput) return;

        const { currentTick, keysPressed } = player.nextInput;
        const onGround = !player.isJumping;

        if (!player.currentTick) {
            player.currentTick = currentTick;
        } else {
            const tickDiff = currentTick - player.currentTick;
            if (tickDiff > 1) {
                player.currentTick = currentTick;
            } else {
                player.currentTick = currentTick;
            }
        }

        if (onGround) {
            if (keysPressed.ArrowLeft && !keysPressed.ArrowRight) {
                player.movingDirection = "ArrowLeft";
            } else if (keysPressed.ArrowRight && !keysPressed.ArrowLeft) {
                player.movingDirection = "ArrowRight";
            } else {
                player.movingDirection = null;
                player.horizontalVelocity = 0;
            }
            if (keysPressed.ArrowUp && !player.isJumping) {
                player.isJumping = true;
                player.verticalVelocity = getJumpVelocity(player);
            }
        }

        player.isPunching = keysPressed.KeyP && !player.isPunching;
        player.isKicking = keysPressed.KeyK && !player.isKicking;
    }

    updatePlayerState(player) {
        player.serverTick = this.serverTick;
        const onGround = !player.isJumping;

        const speed = getMovementSpeed(player);
        if (player.movingDirection === "ArrowLeft") {
            player.horizontalVelocity = -speed;
        } else if (player.movingDirection === "ArrowRight") {
            player.horizontalVelocity = speed;
        } else {
            player.horizontalVelocity = 0;
        }

        if (player.horizontalVelocity !== 0) {
            player.x += player.horizontalVelocity;
            const width = getCharacterWidth(player);
            player.x = Math.max(0, Math.min(ARENA_WIDTH - width, player.x));
        }

        if (player.isJumping) {
            player.height -= player.verticalVelocity;
            player.verticalVelocity += GRAVITY;

            if (player.height <= 0) {
                player.height = 0;
                player.verticalVelocity = 0;
                player.isJumping = false;
            }
        }
    }

    updatePlayerFacingDirections() {
        if (this.gameState.players.size < 2) return;
        const playerArray = Array.from(this.gameState.players.values());

        playerArray.forEach((player) => {
            let closestDistance = Infinity;
            let closestPlayer = null;

            playerArray.forEach((opponent) => {
                if (opponent.id !== player.id) {
                    const distance = Math.abs(opponent.x - player.x);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestPlayer = opponent;
                    }
                }
            });

            if (closestPlayer) {
                if (closestPlayer.x > player.x) {
                    player.facing = "right";
                } else {
                    player.facing = "left";
                }
            }
        });
    }
}
