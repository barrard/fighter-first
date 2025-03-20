# Installation and Setup Instructions

## Dependencies

```bash
npm init -y
npm install express socket.io
```

## File Structure

Create the following directory structure:

```
project-root/
├── server.js          # From the "Server Code with Attacks" artifact
└── public/
    └── index.html     # From the "Client Code with Attacks" artifact
```

## Start the Server

```bash
node server.js
```

## Testing the Game

1. Open your browser and navigate to http://localhost:3000
2. Open additional browser windows to test multiplayer functionality
3. Controls:
    - Arrow keys for movement (← →) and jumping (↑)
    - Z key to punch
    - X key to kick

## Features Added

-   Player vs. player combat system with punch and kick attacks
-   Health bars and damage system
-   Score tracking and knockout notifications
-   Animated attack visualizations
-   Player facing that automatically adjusts to face opponents
