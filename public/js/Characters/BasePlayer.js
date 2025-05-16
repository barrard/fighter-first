import CONSTS from "http://localhost:3000/js/contants.js";
const {
    PREDICTION_BUFFER_MS,
    inputCooldown,
    INTERPOLATION_AMOUNT,
    INTERPOLATION_DELAY,
    PLAYER_WIDTH,
    PLAYER_HEIGHT,
    MOVEMENT_SPEED,
    FLOOR_HEIGHT,
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
    LEG_Y_OFFSET,
} = CONSTS;

class BasePlayer {
    constructor({
        socket,
        playerId,
        serverTick = 0,
        startX,
        color = "#" + Math.floor(Math.random() * 16777215).toString(16),
        facing = "right",
        currentTick = 0,
        currentFrame = 0,
        armWidth = ARM_WIDTH,
        armHeight = ARM_HEIGHT,
        armYOffset = ARM_Y_OFFSET,
        legWidth = LEG_WIDTH,
        legHeight = LEG_HEIGHT,
        legYOffset = LEG_Y_OFFSET,
        width = PLAYER_WIDTH,
        height = PLAYER_HEIGHT,
        movementSpeed = MOVEMENT_SPEED,
        jumpVelocity = JUMP_VELOCITY,
        punchDuration = PUNCH_DURATION,
        kickDuration = KICK_DURATION,
    }) {
        this.socket = socket;

        this.id = playerId;
        this.x = startX; // Start position
        this.jumpHeight = 0; // Height above floor (0 = on floor, positive = above floor)
        this.color = color;
        this.movingDirection = null;
        this.horizontalVelocity = 0;
        this.isJumping = false;
        this.verticalVelocity = 0;
        this.facing = facing; // Default facing direction
        this.batchInput = [];
        this.serverTick = serverTick;
        this.currentTick = currentTick;
        this.currentFrame = currentFrame;

        // Add fighting mechanics properties
        this.isPunching = false;
        this.isKicking = false;
        this.punchTimer = 0;
        this.kickTimer = 0;

        // Combat dimensions
        this.armWidth = armWidth;
        this.armHeight = armHeight;
        this.armYOffset = armYOffset;
        this.legWidth = legWidth;
        this.legHeight = legHeight;
        this.legYOffset = legYOffset;

        // Constants that could be overridden by child classes
        this.width = width;
        this.height = height;
        this.movementSpeed = movementSpeed;
        this.jumpVelocity = jumpVelocity;
        this.punchDuration = punchDuration;
        this.kickDuration = kickDuration;
    }

    // Basic movement methods
    moveLeft() {
        this.horizontalVelocity = -this.movementSpeed;
        this.facing = "left";
        this.movingDirection = "left";
    }

    moveRight() {
        this.horizontalVelocity = this.movementSpeed;
        this.facing = "right";
        this.movingDirection = "right";
    }

    stopMoving() {
        this.movingDirection = null;
    }

    jump() {
        if (!this.isJumping) {
            this.isJumping = true;
            this.verticalVelocity = this.jumpVelocity;
        }
    }

    punch() {
        if (!this.isPunching) {
            this.isPunching = true;
            this.punchTimer = this.punchDuration;
        }
    }

    kick() {
        if (!this.isKicking) {
            this.isKicking = true;
            this.kickTimer = this.kickDuration;
        }
    }

    // Physics update
    update() {
        // Apply gravity
        if (this.isJumping || this.height > 0) {
            this.verticalVelocity += GRAVITY;
            this.height += this.verticalVelocity;

            // Check if landed
            if (this.height >= 0) {
                this.height = 0;
                this.verticalVelocity = 0;
                this.isJumping = false;
            }
        }

        // Apply friction/air resistance
        if (this.height > 0) {
            // Air resistance
            this.horizontalVelocity *= 1 - AIR_RESISTANCE;
        } else {
            // Ground friction
            this.horizontalVelocity *= 1 - GROUND_FRICTION;
        }

        // Apply horizontal velocity
        this.x += this.horizontalVelocity;

        // Prevent going out of bounds
        if (this.x < 0) this.x = 0;
        if (this.x > MAX_WIDTH - this.width) this.x = MAX_WIDTH - this.width;

        // Update punch timer
        if (this.isPunching) {
            this.punchTimer -= 16; // Assuming 60fps, ~16ms per frame
            if (this.punchTimer <= 0) {
                this.isPunching = false;
                this.punchTimer = 0;
            }
        }

        // Update kick timer
        if (this.isKicking) {
            this.kickTimer -= 16; // Assuming 60fps, ~16ms per frame
            if (this.kickTimer <= 0) {
                this.isKicking = false;
                this.kickTimer = 0;
            }
        }

        this.currentTick++;
        this.currentFrame++;
    }

    // Process batch inputs
    processBatchInput(input) {
        this.batchInput.push(input);
    }

    // Get player state (for sending to clients)
    getState() {
        return {
            id: this.id,
            x: this.x,
            height: this.height,
            color: this.color,
            movingDirection: this.movingDirection,
            facing: this.facing,
            isJumping: this.isJumping,
            isPunching: this.isPunching,
            isKicking: this.isKicking,
        };
    }

    // Helper method to get punch hitbox
    getPunchHitbox() {
        const hitboxX =
            this.facing === "right"
                ? this.x + this.width // Right side of player
                : this.x - this.armWidth; // Left side of player

        return {
            x: hitboxX,
            y: FLOOR_Y - this.height - this.height + this.armYOffset,
            width: this.armWidth,
            height: this.armHeight,
        };
    }

    // Helper method to get kick hitbox
    getKickHitbox() {
        const hitboxX =
            this.facing === "right"
                ? this.x + this.width // Right side of player
                : this.x - this.legWidth; // Left side of player

        return {
            x: hitboxX,
            y: FLOOR_Y - this.height - this.height + this.legYOffset,
            width: this.legWidth,
            height: this.legHeight,
        };
    }

    // Helper method to check if two boxes collide
    checkBoxCollision(box1, box2) {
        return (
            box1.x < box2.x + box2.width &&
            box1.x + box1.width > box2.x &&
            box1.y < box2.y + box2.height &&
            box1.y + box1.height > box2.y
        );
    }

    // INPUT METHODS
    init() {
        // Bind event listeners
        this.setupEventListeners();
        // Set up the tick interval
        // this.tickTimer = setInterval(() => this.updateTick(), this.batchInterval);
        // Set up the batch sending interval
        // this.batchTimer = setInterval(() => this.sendBatch(), this.batchInterval);
    }

    updateTick() {
        // this.currentTime = new Date().getTime();
        this.currentTick = this.currentTick + 1;
        // this.addKeysPressedToCurrentInputs();
    }

    setDefaultInputState() {
        this.stateChanged = false;
        this.keysPressed = {
            ArrowLeft: false,
            ArrowRight: false,
            ArrowUp: false,
            ArrowDown: false,
            KeyP: false,
            KeyK: false,
        };
        // this.currentInputs = {};
    }

    setupEventListeners() {
        // Handle keydown events
        window.addEventListener("keydown", (e) => {
            // Extract the key or code to use as identifier
            const keyCode = e.code;
            console.log("keydown", keyCode);
            // Only process if we're tracking this key
            if (keyCode in this.keysPressed) {
                this.keysPressed[keyCode] = true;

                this.handleKeysPressed(keyCode);
            } else {
                console.log("ELSE WHAT???");
            }
        });

        // Handle keyup events
        window.addEventListener("keyup", (e) => {
            const keyCode = e.code;
            console.log("keyup", keyCode);

            if (keyCode in this.keysPressed && this.keysPressed[keyCode]) {
                this.keysPressed[keyCode] = false;
                // this.stateChanged = true;

                // Update the input state to be sent
            }
        });
    }

    handleKeysPressed(keyCode) {
        // if (keyCode === "ArrowLeft" || keyCode === "ArrowRight") {
        // this.isMoving = true;
        if (!this.keysPressed.ArrowRight) {
            console.log("handle key press should alawyas be RIGHT");
        }
        if (keyCode === "ArrowLeft") {
            this.keysPressed.ArrowLeft = true;
        } else if (keyCode === "ArrowRight") {
            this.keysPressed.ArrowRight = true;
        }
        // }
        // Handle jump
        if (keyCode === "ArrowUp") {
            console.log("Jump key pressed");
            this.keysPressed.ArrowUp = true;
        }

        // Handle punch
        if (keyCode === "KeyP") {
            console.log("Punch key pressed");

            this.keysPressed.KeyP = true;

            // Set timeout to reset punch state
            setTimeout(() => {
                this.keysPressed.KeyP = false;
            }, this.PUNCH_DURATION);
        }

        // Handle kick
        if (keyCode === "KeyK" && !this.isKicking && !this.isPunching) {
            console.log("Kick key pressed");
            this.keysPressed.KeyK = false;

            // Set timeout to reset kick state
            setTimeout(() => {
                this.keysPressed.KeyK = false;
            }, this.KICK_DURATION);
        }
    }

    sendBatch() {
        // Only send if there's been a state change
        const data = {
            keysPressed: [...this.gameLoop.inputsOnDeck],
            currentTick: this.currentTick,
        };
        this.sentInputWithTicks.push(data);
        if (this.sentInputWithTicks.length > 10) {
            this.sentInputWithTicks.shift();
        }
        this.gameLoop.inputsOnDeck = [];
        console.log(this.sentInputWithTicks.map((d) => d.currentTick));
        console.log({
            "sendBatch.currentTick": this.currentTick,
        });
        // Send the current state to the server
        this.socket.emit("playerInputBatch", data);
    }

    // Clean up when no longer needed
    destroy() {
        clearInterval(this.batchTimer);
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
    }
}

export default BasePlayer;
