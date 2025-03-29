// InputBatchHandler.js
export default class InputBatchHandler {
    constructor(socket, batchInterval = 50) {
        this.socket = socket;
        this.batchInterval = batchInterval;
        this.sequenceNumber = 0;
        this.isSending = false;
        this.lastSentTime = 0;
        this.currentTick = 0;
        this.minTickTime = 25;
        this.currentTime = new Date().getTime();

        this.setDefaultInputState();

        // Track special action states
        this.isJumping = false;
        this.isPunching = false;
        this.isKicking = false;

        // Constants for animation durations
        this.PUNCH_DURATION = 300;
        this.KICK_DURATION = 400;
        this.JUMP_VELOCITY = -10; // Example value

        // Batched input state that will be sent to server
        this.inputState = {
            keysPressed: { ...this.keysPressed },
            isJumping: false,
            isPunching: false,
            isKicking: false,
            timestamp: Date.now(),
        };

        // Flag to track if the state has changed since last send
        this.stateChanged = false;

        // Set up the tick interval
        this.tickTimer = setInterval(() => this.updateTick(), this.batchInterval);
        // Set up the batch sending interval
        this.batchTimer = setInterval(() => this.sendBatch(), this.batchInterval);

        // Bind event listeners
        this.setupEventListeners();
    }
    updateTick() {
        this.currentTime = new Date().getTime();
        this.currentTick = this.currentTick + 1;
        this.addKeysPressedToCurrentInputs();
        this.sendBatch();
    }

    setDefaultInputState() {
        this.stateChanged = false;
        this.keysPressed = {
            ArrowLeft: false,
            ArrowRight: false,
            ArrowUp: false,
            KeyP: false,
            KeyK: false,
        };
        this.currentInputs = {};
    }

    addKeysPressedToCurrentInputs() {
        this.currentInputs[this.currentTick] = { ...this.keysPressed };
    }

    setupEventListeners() {
        // Handle keydown events
        window.addEventListener("keydown", (e) => {
            // Extract the key or code to use as identifier
            const keyCode = e.code === "KeyP" || e.code === "KeyK" ? e.code : e.key;
            // Only process if we're tracking this key
            if (keyCode in this.keysPressed && !this.keysPressed[keyCode]) {
                this.keysPressed[keyCode] = true;

                this.handleKeysPressed(keyCode);
            }
        });

        // Handle keyup events
        window.addEventListener("keyup", (e) => {
            const keyCode = e.code;

            if (keyCode in this.keysPressed && this.keysPressed[keyCode]) {
                this.keysPressed[keyCode] = false;
                // this.stateChanged = true;

                // Update the input state to be sent
            }
        });
    }

    handleKeysPressed(keyCode) {
        if (keyCode === "ArrowLeft" || keyCode === "ArrowRight") {
            // this.isMoving = true;
            if (keyCode === "ArrowLeft") {
                this.keysPressed.ArrowLeft = true;
            } else if (keyCode === "ArrowRight") {
                this.keysPressed.ArrowRight = true;
            }
        }
        // Handle jump
        if (keyCode === "ArrowUp" && !this.isJumping) {
            console.log("Jump key pressed");
            this.keysPressed.ArrowUp = true;
            this.isJumping = true;
        }

        // Handle punch
        if (keyCode === "KeyP" && !this.isPunching && !this.isKicking) {
            console.log("Punch key pressed");
            this.isPunching = true;

            this.keysPressed.KeyP = true;

            // Set timeout to reset punch state
            setTimeout(() => {
                this.isPunching = false;
                this.keysPressed.KeyP = false;
            }, this.PUNCH_DURATION);
        }

        // Handle kick
        if (keyCode === "KeyK" && !this.isKicking && !this.isPunching) {
            console.log("Kick key pressed");
            this.isKicking = true;
            this.keysPressed.KeyK = false;

            // Set timeout to reset kick state
            setTimeout(() => {
                this.isKicking = false;
                this.keysPressed.KeyK = false;
            }, this.KICK_DURATION);
        }
    }

    sendBatch() {
        // Only send if there's been a state change

        // Send the current state to the server
        this.socket.emit("playerInputBatch", {
            keysPressed: { ...this.keysPressed },
            currentTick: this.currentTick,
        });
    }

    // Force send the current input state immediately
    flushInputs() {
        this.sequenceNumber++;

        this.socket.emit("playerInputBatch", {
            inputState: this.inputState,
            sequenceNumber: this.sequenceNumber,
            batchId: Date.now(),
            // playerId: this.socket.id,
        });

        this.lastSentTime = Date.now();
        this.stateChanged = false;
    }

    // Method to reset jump state (can be called by game physics)
    resetJump() {
        if (this.isJumping) {
            this.isJumping = false;
            this.stateChanged = true;
        }
    }

    // Clean up when no longer needed
    destroy() {
        clearInterval(this.batchTimer);
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
    }
}
