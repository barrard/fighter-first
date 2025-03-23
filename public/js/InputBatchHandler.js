// InputBatchHandler.js
export default class InputBatchHandler {
    constructor(socket, batchInterval = 50) {
        this.socket = socket;
        this.batchInterval = batchInterval;
        this.inputQueue = [];
        this.sequenceNumber = 0;
        this.isSending = false;
        this.lastSentTime = 0;
    }

    // Add a new input event to the queue
    addInput(inputState) {
        // Assign a sequence number to the input
        this.sequenceNumber++;
        const timestamp = Date.now();

        // Add to queue
        this.inputQueue.push({
            ...inputState,
            sequenceNumber: this.sequenceNumber,
            timestamp,
        });

        // Start sending if not already in progress
        if (!this.isSending) {
            this.startSendingBatches();
        }

        return this.sequenceNumber; // Return the sequence number for tracking
    }

    // Start the process of sending batches
    startSendingBatches() {
        this.isSending = true;
        this.processBatch();
    }

    // Process and send a batch of inputs
    processBatch() {
        const now = Date.now();

        // If enough time has passed, or queue is getting large, send the batch
        if (now - this.lastSentTime >= this.batchInterval || this.inputQueue.length > 10) {
            if (this.inputQueue.length > 0) {
                // Send the batch
                this.socket.emit("playerInputBatch", {
                    inputs: this.inputQueue,
                    batchId: Date.now(),
                    playerId: this.socket.id,
                });

                // Clear the queue and update last sent time
                this.lastSentTime = now;
                this.inputQueue = [];
            }
        }

        // If there are more inputs to send, schedule another batch
        if (this.inputQueue.length > 0) {
            setTimeout(() => this.processBatch(), this.batchInterval);
        } else {
            this.isSending = false;
        }
    }

    // Force send all queued inputs immediately
    flushInputs() {
        if (this.inputQueue.length > 0) {
            this.socket.emit("playerInputBatch", {
                inputs: this.inputQueue,
                batchId: Date.now(),
                playerId: this.socket.id,
            });

            this.lastSentTime = Date.now();
            this.inputQueue = [];
            this.isSending = false;
        }
    }
}
