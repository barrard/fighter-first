// Client-side latency monitor
class LatencyMonitor {
    constructor(socket) {
        this.socket = socket;
        this.pingInterval = 1000; // Send ping every second
        this.pingHistory = []; // Store recent ping measurements
        this.historySize = 10; // Number of measurements to keep
        this.currentLatency = 0;
        this.minLatency = Infinity;
        this.maxLatency = 0;

        this.setupListeners();
        this.startHeartbeat();
    }

    setupListeners() {
        // Listen for pong responses from server
        this.socket.on("pong", (data) => {
            const now = Date.now();
            const latency = now - data.clientTimestamp;

            this.updateLatencyStats(latency);
            this.displayLatency();
        });
    }

    startHeartbeat() {
        setInterval(() => {
            this.sendPing();
        }, this.pingInterval);
    }

    sendPing() {
        this.socket.emit("ping", {
            clientTimestamp: Date.now(),
        });
    }

    updateLatencyStats(latency) {
        // Add to history and maintain history size
        this.pingHistory.push(latency);
        if (this.pingHistory.length > this.historySize) {
            this.pingHistory.shift();
        }

        // Update current latency (average of recent pings)
        this.currentLatency = Math.round(this.pingHistory.reduce((sum, val) => sum + val, 0) / this.pingHistory.length);

        // Update min/max
        this.minLatency = Math.min(this.minLatency, latency);
        this.maxLatency = Math.max(this.maxLatency, latency);
    }

    displayLatency() {
        // Get or create latency display element
        let latencyDisplay = document.getElementById("latency-display");
        if (!latencyDisplay) {
            latencyDisplay = document.createElement("div");
            latencyDisplay.id = "latency-display";
            latencyDisplay.style.position = "absolute";
            latencyDisplay.style.top = "10px";
            latencyDisplay.style.right = "10px";
            latencyDisplay.style.padding = "5px";
            latencyDisplay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
            latencyDisplay.style.color = "white";
            latencyDisplay.style.fontFamily = "monospace";
            latencyDisplay.style.borderRadius = "3px";
            document.body.appendChild(latencyDisplay);
        }

        // Determine color based on latency
        let color = "#00ff00"; // Green for good latency
        if (this.currentLatency > 100) color = "#ffff00"; // Yellow for medium latency
        if (this.currentLatency > 200) color = "#ff0000"; // Red for high latency

        latencyDisplay.innerHTML = `
		<div>Ping: <span style="color:${color}">${this.currentLatency}ms</span></div>
		<div>Min: ${this.minLatency}ms</div>
		<div>Max: ${this.maxLatency}ms</div>
	  `;
    }

    getLatency() {
        return this.currentLatency;
    }
}

export default LatencyMonitor;
