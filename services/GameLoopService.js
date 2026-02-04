import { performance } from "perf_hooks";
import { encodeGameStatePayload } from "../../shared/stateCodec.js";
import {
    CANVAS_WIDTH,
    FLOOR_Y,
    GRAVITY,
    SERVER_TICK_RATE,
} from "../../shared/gameConstants.js";

// Server-only constants
const ARENA_WIDTH = CANVAS_WIDTH;
const TICK_RATE = SERVER_TICK_RATE;
const ONE_SECOND = 1000;
const SIMULATION_DELAY = 6;
const BROADCAST_INTERVAL = 3;
const HIT_STUN_FRAMES = 10;
const DEBUG_NET = process.env.DEBUG_NET === "1" || process.env.DEBUG_NET === "true";
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
                    isCrouching: Boolean(player.isCrouching),
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
            // No exact match and no previous input — find the closest
            // buffered tick <= simulationTick to bootstrap lastInput.
            const bufferKeys = Object.keys(player.inputBuffer).map(Number);
            let bestTick = -1;
            for (let i = 0; i < bufferKeys.length; i++) {
                if (bufferKeys[i] <= simulationTick && bufferKeys[i] > bestTick) {
                    bestTick = bufferKeys[i];
                }
            }
            if (bestTick >= 0) {
                keysPressed = player.inputBuffer[bestTick];
                player.lastInput = keysPressed;
                player.lastProcessedTick = simulationTick;
            } else {
                return;
            }
        }

        // Clean up stale buffer entries
        for (const tick of Object.keys(player.inputBuffer)) {
            if (Number(tick) < simulationTick) {
                delete player.inputBuffer[tick];
            }
        }

        const onGround = !player.isJumping;

        if (onGround) {
            if (keysPressed.left && !keysPressed.right) {
                player.movingDirection = "left";
            } else if (keysPressed.right && !keysPressed.left) {
                player.movingDirection = "right";
            } else {
                player.movingDirection = null;
                player.horizontalVelocity = 0;
            }
            if (keysPressed.jump && !player.isJumping) {
                player.isJumping = true;
                player.verticalVelocity = player.jumpVelocity;
            }
            // Handle crouch
            player.isCrouching = Boolean(keysPressed.crouch);
        } else {
            player.isCrouching = false;
        }

        // Handle punch input - only start if not already attacking
        if (keysPressed.punch && !player.isPunching && !player.isKicking && !player.attackState) {
            player.isPunching = true;
            player.attackState = {
                type: "punch",
                startTick: simulationTick,
                hasHit: false,
            };
        }

        // Handle kick input - only start if not already attacking
        if (keysPressed.kick && !player.isKicking && !player.isPunching && !player.attackState) {
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
        const width = player.characterWidth;

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

        const speed = player.movementSpeed;
        if (player.movingDirection === "left") {
            player.horizontalVelocity = -speed;
        } else if (player.movingDirection === "right") {
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
                ? Math.ceil(player.punchDuration / (1000 / 60)) // Convert ms to frames
                : Math.ceil(player.kickDuration / (1000 / 60));

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
            ? player.punchActiveStart
            : player.kickActiveStart;
        const activeEnd = player.attackState.type === "punch"
            ? player.punchActiveEnd
            : player.kickActiveEnd;

        return attackAge >= activeStart && attackAge <= activeEnd;
    }

    checkAttackCollision(attacker, target) {
        const attackHitbox = this.getAttackHitbox(attacker);
        const targetHurtbox = this.getPlayerHurtbox(target);

        if (this.boxesOverlap(attackHitbox, targetHurtbox)) {
            const isPunch = attacker.attackState.type === "punch";
            const damage = isPunch ? attacker.punchDamage : attacker.kickDamage;
            const knockback = isPunch ? attacker.punchKnockback : attacker.kickKnockback;

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
        const width = player.characterWidth;
        const isPunch = player.attackState.type === "punch";

        // Hitbox extends from the player in the facing direction
        const hitboxWidth = isPunch ? player.armWidth : player.legWidth;
        const hitboxHeight = isPunch ? player.armHeight : player.legHeight;
        const yOffset = isPunch ? player.armYOffset : player.legYOffset;

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
            width: player.characterWidth,
            height: player.characterHeight,
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
