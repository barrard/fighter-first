// InputBatchHandler.js
export default class InputBatchHandler {
    constructor(socket, batchInterval = 50) {
        this.socket = socket;
        this.batchInterval = batchInterval;
        this.sequenceNumber = 0;
        this.isSending = false;
        this.lastSentTime = 0;
        this.currentTick = 0;
        this.sentInputWithTicks = [];
        // this.minTickTime = 25;
        // this.currentTime = new Date().getTime();

        this.setDefaultInputState();

        // Track special action states
        // this.isJumping = false;
        // this.isPunching = false;
        // this.isKicking = false;

        // Constants for animation durations
        this.PUNCH_DURATION = 300;
        this.KICK_DURATION = 400;
        this.JUMP_VELOCITY = -10; // Example value

        // Flag to track if the state has changed since last send
        this.stateChanged = false;
    }

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

    // addKeysPressedToCurrentInputs() {
    //     this.currentInputs[this.currentTick] = { ...this.keysPressed };
    // }

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
        // console.log(this.sentInputWithTicks.map((d) => d.currentTick));
        // console.log({
        //     "sendBatch.currentTick": this.currentTick,
        // });
        // Send the current state to the server
        this.socket.emit("playerInputBatch", data);
    }

    // Method to reset jump state (can be called by game physics)
    // resetJump() {
    //     if (this.isJumping) {
    //         this.isJumping = false;
    //         this.stateChanged = true;
    //     }
    // }

    // Clean up when no longer needed
    destroy() {
        clearInterval(this.batchTimer);
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
    }
}
