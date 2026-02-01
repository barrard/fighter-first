import { performance } from "perf_hooks";
import { encodeGameStatePayload } from "../../shared/stateCodec.js";

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
const ARENA_WIDTH = 1024;
const JUMP_VELOCITY = -15;
const GRAVITY = 0.8;
const FLOOR_Y = 536; // CANVAS_HEIGHT(576) - FLOOR_HEIGHT(40)
const FLOOR_HEIGHT = 40; // or some other value
const AIR_RESISTANCE = 0.02;
const GROUND_FRICTION = 0.2;
const ONE_SECOND = 1000;
const TICK_RATE = 60;
const SIMULATION_DELAY = 6;
const BROADCAST_INTERVAL = 3;
const DEBUG_NET = process.env.DEBUG_NET === "1" || process.env.DEBUG_NET === "true";

const getCharacterWidth = (player) => player?.characterWidth || PLAYER_WIDTH;
const getCharacterHeight = (player) => player?.characterHeight || PLAYER_HEIGHT;
const getMovementSpeed = (player) => player?.movementSpeed || MOVEMENT_SPEED;
const getJumpVelocity = (player) => player?.jumpVelocity || JUMP_VELOCITY;
const getPunchDuration = (player) => player?.punchDuration || PUNCH_DURATION;
const getKickDuration = (player) => player?.kickDuration || KICK_DURATION;

// Combat stat getters
const getPunchDamage = (player) => player?.punchDamage || 10;
const getKickDamage = (player) => player?.kickDamage || 15;
const getPunchKnockback = (player) => player?.punchKnockback || 8;
const getKickKnockback = (player) => player?.kickKnockback || 12;
const getPunchActiveStart = (player) => player?.punchActiveStart || 3;
const getPunchActiveEnd = (player) => player?.punchActiveEnd || 8;
const getKickActiveStart = (player) => player?.kickActiveStart || 5;
const getKickActiveEnd = (player) => player?.kickActiveEnd || 12;

const HIT_STUN_FRAMES = 10;
const roundTo = (value, precision = 2) => {
    if (typeof value !== "number" || Number.isNaN(value)) return 0;
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
};

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
        this.roundDurationSeconds = 99;
        this.roundStartTick = 0;
        this.roundActive = false;
        this.roundOver = false;
        this.lastTimerSecond = null;
        this.onRoundEnd = null;
        this.onRoundTimer = null;
    }

    start() {
        // Reset tick counters for a fresh round start
        this.serverTick = 0;
        this.lastServerTick = 0;
        this.lastTimeSent = 0;
        this.dataSent = 0;
        this.loopTimes = [];
        this.matchStartTime = performance.now();
        this.gameLoopInterval = setInterval(() => {
            this.tick();
        }, 1000 / TICK_RATE); // 60 fps
    }

    getMatchStartInfo() {
        return {
            serverTick: this.serverTick,
            serverTimeMs: performance.now(),
            tickRate: TICK_RATE,
            matchStartTick: this.serverTick + SIMULATION_DELAY,
        };
    }

    stop() {
        clearInterval(this.gameLoopInterval);
    }

    startRound() {
        this.roundStartTick = this.serverTick;
        this.roundActive = true;
        this.roundOver = false;
        this.lastTimerSecond = null;
    }

    getRoundRemainingSeconds() {
        const elapsedTicks = this.serverTick - this.roundStartTick;
        const elapsedSeconds = Math.floor(elapsedTicks / TICK_RATE);
        return Math.max(0, this.roundDurationSeconds - elapsedSeconds);
    }

    checkRoundTimer() {
        if (!this.roundActive || this.roundOver) return;
        const remaining = this.getRoundRemainingSeconds();
        if (remaining !== this.lastTimerSecond) {
            this.lastTimerSecond = remaining;
            if (typeof this.onRoundTimer === "function") {
                this.onRoundTimer(remaining, this.serverTick);
            }
        }
        if (remaining <= 0) {
            this.signalRoundEnd("timer");
        }
    }

    checkRoundEndByHealth() {
        if (!this.roundActive || this.roundOver) return;
        const players = Array.from(this.gameState.players.values());
        if (players.length < 2) return;
        const anyDown = players.some((player) => (player.health ?? 0) <= 0);
        if (anyDown) {
            this.signalRoundEnd("health");
        }
    }

    signalRoundEnd(reason) {
        if (this.roundOver) return;
        this.roundOver = true;
        this.roundActive = false;
        if (DEBUG_NET) {
            console.log(
                `[ROUND END] room=${this.roomName} reason=${reason} serverTick=${this.serverTick} remaining=${this.lastTimerSecond ?? "n/a"}`
            );
        }
        if (typeof this.onRoundEnd === "function") {
            const players = Array.from(this.gameState.players.values()).map((player) => ({
                id: player.id,
                health: player.health ?? 0,
            }));
            this.onRoundEnd({
                reason,
                serverTick: this.serverTick,
                remainingSeconds: this.lastTimerSecond ?? this.getRoundRemainingSeconds(),
                players,
            });
        }
    }

    tick() {
        const startTime = performance.now();
        // Derive target tick from wall-clock time so it stays in sync with clients
        const targetTick = Math.floor((startTime - this.matchStartTime) * TICK_RATE / 1000);

        if (targetTick <= this.serverTick) return; // No new ticks to process
        const backlog = targetTick - this.serverTick;
        if (DEBUG_NET && backlog > 1 && this.serverTick % 60 === 0) {
            console.log(
                `[TICK DEBUG] room=${this.roomName} serverTick=${this.serverTick} targetTick=${targetTick} backlog=${backlog}`
            );
        }

        // Process all ticks up to target (catches up if setInterval fires late)
        while (this.serverTick < targetTick) {
            this.serverTick++;

            if (this.roundActive) {
                this.updatePlayerFacingDirections();

                this.gameState.players.forEach((player) => {
                    this.handlePlayerInput(player);
                    this.updatePlayerState(player);
                });

                // Process combat after all players have updated
                this.processCombat();
                this.checkRoundEndByHealth();
            }
            this.checkRoundTimer();

            // Broadcast every BROADCAST_INTERVAL ticks
            const tickDiff = this.serverTick - this.lastServerTick;
            if (tickDiff >= BROADCAST_INTERVAL) {
                this.dataSent++;
                this.lastServerTick = this.serverTick;
                this.lastTimeSent = Date.now();
                const simulationTick = this.serverTick - SIMULATION_DELAY;
                const players = Array.from(this.gameState.players.values()).map((player) => ({
                    id: player.id,
                    x: roundTo(player.x),
                    lastProcessedTick: player.lastProcessedTick,
                    height: roundTo(player.height),
                    facing: player.facing,
                    isJumping: Boolean(player.isJumping),
                    isKicking: Boolean(player.isKicking),
                    isPunching: Boolean(player.isPunching),
                    verticalVelocity: roundTo(player.verticalVelocity),
                    horizontalVelocity: roundTo(player.horizontalVelocity),
                    serverTick: player.serverTick,
                    health: player.health,
                    hitStun: player.hitStun || 0,
                }));
                const payload = encodeGameStatePayload({ simulationTick, players });
                this.io.to(this.roomName).emit("gs", payload);
            }
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
        const simulationTick = this.serverTick - SIMULATION_DELAY;
        const input = player.inputBuffer[simulationTick];

        if (DEBUG_NET && this.serverTick % 60 === 0) {
            const bufferKeys = Object.keys(player.inputBuffer).map(Number).sort((a, b) => a - b);
            const bufferRange = bufferKeys.length > 0
                ? `[${bufferKeys[0]}..${bufferKeys[bufferKeys.length - 1]}]`
                : "[]";
            console.log(
                `[TICK DEBUG] player=${player.id.substring(0, 6)} serverTick=${this.serverTick} simTick=${simulationTick} found=${Boolean(input)} bufferSize=${bufferKeys.length} bufferRange=${bufferRange} lastProcessedTick=${player.lastProcessedTick}`
            );
        }

        let keysPressed;
        if (input) {
            keysPressed = input;
            player.lastInput = input;
            player.lastProcessedTick = simulationTick;
        } else if (player.lastInput) {
            keysPressed = player.lastInput;
        } else {
            return;
        }

        // Clean up stale buffer entries
        for (const tick of Object.keys(player.inputBuffer)) {
            if (Number(tick) < simulationTick) {
                delete player.inputBuffer[tick];
            }
        }

        const onGround = !player.isJumping;

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

        // Handle punch input - only start if not already attacking
        if (keysPressed.KeyP && !player.isPunching && !player.isKicking && !player.attackState) {
            player.isPunching = true;
            player.attackState = {
                type: "punch",
                startTick: simulationTick,
                hasHit: false,
            };
        }

        // Handle kick input - only start if not already attacking
        if (keysPressed.KeyK && !player.isKicking && !player.isPunching && !player.attackState) {
            player.isKicking = true;
            player.attackState = {
                type: "kick",
                startTick: simulationTick,
                hasHit: false,
            };
        }
    }

    updatePlayerState(player) {
        player.serverTick = this.serverTick;
        const simulationTick = this.serverTick - SIMULATION_DELAY;
        const width = getCharacterWidth(player);

        // Handle hit stun - prevents movement/actions
        if (player.hitStun > 0) {
            player.hitStun--;

            // Apply knockback during hit stun
            if (player.knockbackVelocity !== 0) {
                player.x += player.knockbackVelocity;
                player.knockbackVelocity *= 0.8; // Decay knockback

                // Clamp to arena bounds
                player.x = Math.max(0, Math.min(ARENA_WIDTH - width, player.x));
            }

            // Still apply gravity during hit stun
            if (player.isJumping) {
                player.height -= player.verticalVelocity;
                player.verticalVelocity += GRAVITY;

                if (player.height <= 0) {
                    player.height = 0;
                    player.verticalVelocity = 0;
                    player.isJumping = false;
                }
            }

            return; // Skip normal movement during hit stun
        }

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

        // Handle attack duration expiry
        if (player.attackState) {
            const attackAge = simulationTick - player.attackState.startTick;
            const durationFrames = player.attackState.type === "punch"
                ? Math.ceil(getPunchDuration(player) / (1000 / 60)) // Convert ms to frames
                : Math.ceil(getKickDuration(player) / (1000 / 60));

            if (attackAge >= durationFrames) {
                player.isPunching = false;
                player.isKicking = false;
                player.attackState = null;
            }
        }
    }

    processCombat() {
        const players = Array.from(this.gameState.players.values());
        if (players.length < 2) return;

        const hits = [];

        // Check each player's attack against all other players
        for (const attacker of players) {
            if (!this.isAttackActive(attacker)) continue;
            if (attacker.attackState?.hasHit) continue; // Already hit this attack

            for (const target of players) {
                if (attacker.id === target.id) continue;
                if (target.hitStun > 0) continue; // Can't hit stunned players

                const hitResult = this.checkAttackCollision(attacker, target);
                if (hitResult.hit) {
                    hits.push({
                        attacker,
                        target,
                        ...hitResult,
                    });
                }
            }
        }

        // Process all hits (handles trades - both players hitting each other)
        for (const hit of hits) {
            this.applyHit(hit);
        }

        // Emit hit events
        if (hits.length > 0) {
            this.emitHitEvents(hits);
        }
    }

    isAttackActive(player) {
        if (!player.attackState?.type) return false;

        const simulationTick = this.serverTick - SIMULATION_DELAY;
        const attackAge = simulationTick - player.attackState.startTick;
        const activeStart = player.attackState.type === "punch"
            ? getPunchActiveStart(player)
            : getKickActiveStart(player);
        const activeEnd = player.attackState.type === "punch"
            ? getPunchActiveEnd(player)
            : getKickActiveEnd(player);

        return attackAge >= activeStart && attackAge <= activeEnd;
    }

    checkAttackCollision(attacker, target) {
        const attackHitbox = this.getAttackHitbox(attacker);
        const targetHurtbox = this.getPlayerHurtbox(target);

        if (this.boxesOverlap(attackHitbox, targetHurtbox)) {
            const isPunch = attacker.attackState.type === "punch";
            const damage = isPunch ? getPunchDamage(attacker) : getKickDamage(attacker);
            const knockback = isPunch ? getPunchKnockback(attacker) : getKickKnockback(attacker);

            return {
                hit: true,
                type: attacker.attackState.type,
                damage,
                knockback: knockback * (attacker.facing === "right" ? 1 : -1),
            };
        }

        return { hit: false };
    }

    getAttackHitbox(player) {
        const width = getCharacterWidth(player);
        const height = getCharacterHeight(player);
        const isPunch = player.attackState.type === "punch";

        // Hitbox extends from the player in the facing direction
        const hitboxWidth = isPunch ? ARM_WIDTH : LEG_WIDTH;
        const hitboxHeight = isPunch ? ARM_HEIGHT : LEG_HEIGHT;
        const yOffset = isPunch ? ARM_Y_OFFSET : LEG_Y_OFFSET;

        return {
            x: player.facing === "right"
                ? player.x + width
                : player.x - hitboxWidth,
            y: player.height + yOffset, // height above ground + offset from top
            width: hitboxWidth,
            height: hitboxHeight,
        };
    }

    getPlayerHurtbox(player) {
        return {
            x: player.x,
            y: player.height, // Height above ground
            width: getCharacterWidth(player),
            height: getCharacterHeight(player),
        };
    }

    boxesOverlap(box1, box2) {
        return (
            box1.x < box2.x + box2.width &&
            box1.x + box1.width > box2.x &&
            box1.y < box2.y + box2.height &&
            box1.y + box1.height > box2.y
        );
    }

    applyHit(hit) {
        const { attacker, target, damage, knockback, type } = hit;

        // Mark attack as having hit (prevents multi-hit)
        attacker.attackState.hasHit = true;

        // Apply damage
        target.health = Math.max(0, target.health - damage);

        // Apply hit stun
        target.hitStun = HIT_STUN_FRAMES;

        // Apply knockback
        target.knockbackVelocity = knockback;

        console.log(
            `[Combat] ${attacker.id} hit ${target.id} with ${type} for ${damage} damage. Target health: ${target.health}`
        );
    }

    emitHitEvents(hits) {
        const events = hits.map((hit) => ({
            attackerId: hit.attacker.id,
            targetId: hit.target.id,
            attackType: hit.type,
            damage: hit.damage,
            targetNewHealth: hit.target.health,
            knockback: hit.knockback,
            tick: this.serverTick,
        }));

        this.io.to(this.roomName).emit("combatHits", events);
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
