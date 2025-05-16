import BasePlayer from "./BasePlayer.js";

class BasicPlayer extends BasePlayer {
    constructor(playerOpts) {
        debugger;
        super(playerOpts);

        // Add BasicPlayer specific properties
        this.health = 100;
        this.score = 0;
        this.lives = 3;
        this.specialMeter = 0; // For special moves
        this.isBlocking = false;
    }

    block(isBlocking) {
        this.isBlocking = isBlocking;
        // Blocking might reduce movement speed
        if (isBlocking) {
            this.horizontalVelocity *= 0.5;
        }
    }

    specialAttack() {
        if (this.specialMeter >= 100) {
            // Perform special attack
            this.specialMeter = 0;
            return true;
        }
        return false;
    }

    takeDamage(amount) {
        // Reduce damage if blocking
        const actualDamage = this.isBlocking ? amount * 0.5 : amount;
        this.health -= actualDamage;

        // Increase special meter when taking damage
        this.specialMeter += actualDamage * 0.5;
        if (this.specialMeter > 100) this.specialMeter = 100;

        if (this.health < 0) this.health = 0;
        return this.health <= 0; // Returns true if player is defeated
    }

    heal(amount) {
        this.health += amount;
        if (this.health > 100) this.health = 100;
    }

    addScore(points) {
        this.score += points;
    }

    loseLife() {
        this.lives--;
        if (this.lives <= 0) return true; // Game over

        // Reset player for next life
        this.health = 100;
        this.x = 100;
        this.height = 0;
        this.isJumping = false;
        this.isPunching = false;
        this.isKicking = false;

        return false; // Still has lives left
    }

    // Override getState to include BasicPlayer specific properties
    getState() {
        const baseState = super.getState();
        return {
            ...baseState,
            health: this.health,
            score: this.score,
            lives: this.lives,
            specialMeter: this.specialMeter,
            isBlocking: this.isBlocking,
        };
    }

    // Helper method to check collision with another player
    checkHitboxCollision(otherPlayer) {
        // Calculate punch hitbox if punching
        if (this.isPunching) {
            const punchHitbox = this.getPunchHitbox();
            const otherPlayerBox = {
                x: otherPlayer.x,
                y: FLOOR_Y - PLAYER_HEIGHT - otherPlayer.height,
                width: PLAYER_WIDTH,
                height: PLAYER_HEIGHT,
            };

            if (this.checkBoxCollision(punchHitbox, otherPlayerBox)) {
                return { hit: true, type: "punch", damage: 10 };
            }
        }

        // Calculate kick hitbox if kicking
        if (this.isKicking) {
            const kickHitbox = this.getKickHitbox();
            const otherPlayerBox = {
                x: otherPlayer.x,
                y: FLOOR_Y - PLAYER_HEIGHT - otherPlayer.height,
                width: PLAYER_WIDTH,
                height: PLAYER_HEIGHT,
            };

            if (this.checkBoxCollision(kickHitbox, otherPlayerBox)) {
                return { hit: true, type: "kick", damage: 15 };
            }
        }

        return { hit: false };
    }
}
